import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ROLES, STATUSES, DIFFICULTY_CONFIG } from '../../../shared/constants';
import TaskForm from './TaskForm';
import TaskList from './TaskList';
import RequestModal from './RequestModal';
import ScheduledTasksList from './ScheduledTasksList';
import ApprovalPanel from './ApprovalPanel';
import EditTaskModal from './EditTaskModal';
import { toISTISOString } from '../../../shared/utils/date';
import Section from '../../../shared/components/Section.jsx';
import { logActivity } from '../../../shared/utils/activityLogger.js';
import { 
  createTask as addTask, 
  patchTask as updateTask, 
  removeTask as deleteTask, 
  createScheduledTask,
  triggerScheduledTasks 
} from '../api/taskApi.js';
import { createMaterialRequest } from '../utils/materialRequest.js';
import { updateUser } from '../../admin/api/adminApi.js';
import { db } from '../../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { DAILY_BONUS_POINTS, formatDateKey, getBonusPointsInRange, hasBonusBeenClaimed, mergeBonusClaim } from '../../../shared/utils/dailyBonus.js';


// This icon is only used here for now. It could be moved to a shared Icon component file.
const PlusIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// Filter button component (moved outside TasksTab to prevent re-creation on render)
const FilterButton = ({ status, label, count, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-200 ${
      isActive
        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
    }`}
  >
    <span>{label}</span>
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none transition-colors ${
        isActive
          ? 'bg-white/20 text-white'
          : 'bg-slate-100 text-slate-500'
      }`}
    >
      {count}
    </span>
  </button>
);

const HOURS_IN_MS = 60 * 60 * 1000;
const DAYS_IN_MS = 24 * HOURS_IN_MS;

const parseDate = (dateValue) => {
  if (!dateValue) return null;

  try {
    // Handle Firestore Timestamp objects (primary format now)
    if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    // Handle Firestore Timestamp with toMillis method
    if (dateValue && typeof dateValue === 'object' && typeof dateValue.toMillis === 'function') {
      return new Date(dateValue.toMillis());
    }
    // Handle Firestore Timestamp with seconds/nanoseconds properties
    if (dateValue && typeof dateValue === 'object' && dateValue.seconds !== undefined) {
      return new Date(dateValue.seconds * 1000 + (dateValue.nanoseconds || 0) / 1000000);
    }
    // Handle regular Date objects
    if (dateValue instanceof Date) {
      return dateValue;
    }
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
      const withTime = new Date(`${dateValue}T00:00:00`);
      if (!Number.isNaN(withTime.getTime())) {
        return withTime;
      }
    }

    console.warn('Unknown date format:', dateValue, typeof dateValue);
    return null;
  } catch (error) {
    console.error('Error parsing date:', dateValue, error);
    return null;
  }
};

const formatHoursAgo = (now, date) => {
  if (!date) return null;
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < HOURS_IN_MS) {
    const minutes = Math.max(1, Math.round(diffMs / (60 * 1000)));
    return `${minutes}m ago`;
  }
  const hours = Math.round(diffMs / HOURS_IN_MS);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

const formatDueTimeline = (now, target) => {
  if (!target) return null;
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / DAYS_IN_MS);
  if (diffDays <= 0) {
    return 'Due today';
  }
  if (diffDays === 1) {
    return 'Due tomorrow';
  }
  return `Due in ${diffDays} days`;
};

function TasksTab({ currentUser, users, departments, tasks, t, openTaskId, setOpenTaskId, onTaskFeedback, onLogActivity = null }) {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState([STATUSES.PENDING, STATUSES.ONGOING]); // Array of selected statuses, default to pending and ongoing
  const [searchQuery, setSearchQuery] = useState(''); // Search query for tasks
  const [isSyncing, setIsSyncing] = useState(false);
  const [bonusLedger, setBonusLedger] = useState(() => currentUser?.dailyBonusLedger || {});
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);
  const [isCelebratingBonus, setIsCelebratingBonus] = useState(false);
  const celebrationTimeoutRef = useRef(null);
  const [showDueSoonOnly, setShowDueSoonOnly] = useState(false);
  const [dismissedSignature, setDismissedSignature] = useState(null);
  const alertStorageKey = currentUser?.id ? `task_priority_nudge_${currentUser.id}` : null;
  const [isTasksLoaded, setIsTasksLoaded] = useState(false);
  const [localTaskUpdates, setLocalTaskUpdates] = useState({});
  
  // Edit task modal state
  const [editingTask, setEditingTask] = useState(null);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);

  // Allow user to edit daily target with a weekly lock (until next Monday)
  const [isEditingTarget, setIsEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState('');

  // Progressive loading: Mark tasks as loaded when they arrive
  useEffect(() => {
    if (tasks.length > 0 && !isTasksLoaded) {
      setIsTasksLoaded(true);
    }
  }, [tasks.length, isTasksLoaded]);

  // Merge local task updates with the original tasks
  const mergedTasks = useMemo(() => {
    return tasks.map(task => ({
      ...task,
      ...localTaskUpdates[task.id]
    }));
  }, [tasks, localTaskUpdates]);

  
  useEffect(() => {
    setBonusLedger(currentUser?.dailyBonusLedger || {});
  }, [currentUser?.dailyBonusLedger]);

  useEffect(() => {
    return () => {
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!alertStorageKey || typeof window === 'undefined') {
      setDismissedSignature(null);
      return;
    }

    try {
      const raw = window.localStorage.getItem(alertStorageKey);
      if (!raw) {
        setDismissedSignature(null);
        return;
      }

      const parsed = JSON.parse(raw);
      setDismissedSignature(parsed?.signature || null);
    } catch (error) {
      console.error('Failed to load priority panel dismissal state', error);
      setDismissedSignature(null);
    }
  }, [alertStorageKey]);

  // Safety checks to prevent initialization errors
  if (!currentUser || !users || !departments || !tasks) {
    return (
      <div className="space-y-4 pb-20">
        <Section title={t('myTasks')}>
          <div className="text-center text-slate-500 py-8">
            {t('loading') || 'Loading...'}
          </div>
        </Section>
      </div>
    );
  }

  const todayKey = formatDateKey(new Date());
  const hasClaimedDailyBonus = hasBonusBeenClaimed(bonusLedger, todayKey);

  console.log('Daily Bonus Check:', {
    hasClaimed: hasClaimedDailyBonus,
    todayKey: todayKey,
    bonusLedger: bonusLedger,
    currentUserExists: !!currentUser
  });

  // Get the completion date for a task (from Points tab)
  const getTaskCompletionDate = (task) => {
    if (task.completedAt) {
      return parseDate(task.completedAt);
    }
    
    // Fallback to updatedAt if completedAt is missing
    if (task.updatedAt) {
      return parseDate(task.updatedAt);
    }
    
    // Last resort: createdAt
    if (task.createdAt) {
      return parseDate(task.createdAt);
    }
    
    return null;
  };
  // Calculate points for a task (from Points tab)
  const calculateTaskPoints = (task) => {
    if (!task.assignedUserIds || !Array.isArray(task.assignedUserIds)) return 0;
    
    const assignedUserCount = task.assignedUserIds.length;
    let basePoints = 50; // Default points
    
    // Use task's difficulty if available
    if (task.difficulty && DIFFICULTY_CONFIG[task.difficulty]) {
      basePoints = DIFFICULTY_CONFIG[task.difficulty].points;
    } else if (task.points && typeof task.points === 'number') {
      basePoints = task.points;
    }
    
    // Split points among assigned users
    const basePointsPerUser = Math.round(basePoints / assignedUserCount);
    
    // Add bonuses
    const collaborationBonus = assignedUserCount > 1 ? Math.round(basePointsPerUser * 0.1) : 0;
    const urgentBonus = task.isUrgent ? Math.round(basePointsPerUser * 0.25) : 0;
    
    return basePointsPerUser + collaborationBonus + urgentBonus;
  };

  // Calculate user's completed tasks (excluding deleted tasks for non-admins)
  const userCompletedTasks = tasks.filter(task => {
    // Hide deleted tasks from regular users (only admins can see them)
    if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
      return false;
    }
    
    return task.assignedUserIds && 
           Array.isArray(task.assignedUserIds) && 
           task.assignedUserIds.includes(currentUser.id) && 
           task.status === STATUSES.COMPLETE;
  });

  const todayStats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= todayStart && completionDate <= todayEnd;
    });

    const taskPoints = todayTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
    const bonusPoints = getBonusPointsInRange(bonusLedger, todayStart, todayEnd);

    return {
      points: taskPoints + bonusPoints,
      tasks: todayTasks.length,
      bonusPoints,
    };
  }, [userCompletedTasks, bonusLedger]);

  const dailyTarget = currentUser?.dailyPointsTarget || 250;
  const progressPct = Math.max(0, Math.min(100, Math.round((todayStats.points / dailyTarget) * 100)));


  const getNextMondayStart = () => {
    const now = new Date();
    const day = now.getDay(); // 0 Sun ... 6 Sat
    const daysUntilMonday = ((8 - day) % 7) || 7; // next Monday
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntilMonday);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  };

  // Compute effective daily target with lock (default 250)
  const effectiveDailyTarget = useMemo(() => {
    const defaultTarget = 250;
    const lockedUntil = parseDate(currentUser?.dailyTargetLockedUntil);
    const now = new Date();
    if (lockedUntil && now < lockedUntil) {
      return currentUser?.dailyPointsTarget || defaultTarget;
    }
    return defaultTarget;
  }, [currentUser]);

  const sliderTarget = effectiveDailyTarget;
  const sliderPct = Math.max(0, Math.min(100, Math.round((todayStats.points / sliderTarget) * 100)));

  const handleClaimDailyBonus = async () => {
    if (isClaimingBonus || hasClaimedDailyBonus || !currentUser?.id) {
      return;
    }

    setIsClaimingBonus(true);
    const isoNow = new Date().toISOString();
    const previousLedger = bonusLedger;
    const updatedLedger = mergeBonusClaim(previousLedger, todayKey, DAILY_BONUS_POINTS, isoNow);
    setBonusLedger(updatedLedger);

    try {
      await updateDoc(doc(db, 'users', currentUser.id), {
        dailyBonusLedger: updatedLedger,
        dailyBonusLastClaimedAt: isoNow,
      });

      try {
        await updateDoc(doc(db, 'Users', currentUser.id), {
          dailyBonusLedger: updatedLedger,
          dailyBonusLastClaimedAt: isoNow,
        });
      } catch (_upperCollectionError) {
        // Ignore missing alternate collection
      }

      if (typeof onTaskFeedback === 'function') {
        onTaskFeedback(t('dailyBonusSuccess', 'Daily bonus claimed! +25 points'), 'success');
      }

      setIsCelebratingBonus(true);
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
      celebrationTimeoutRef.current = setTimeout(() => {
        setIsCelebratingBonus(false);
      }, 1200);
    } catch (error) {
      console.error('Error claiming daily bonus:', error);
      setBonusLedger(previousLedger);
      if (typeof onTaskFeedback === 'function') {
        onTaskFeedback(t('dailyBonusError', 'Failed to claim bonus. Please try again.'), 'error');
      }
    } finally {
      setIsClaimingBonus(false);
    }
  };

  const handleAddTask = async (newTask) => {
    try {
      // Check if this is a scheduled task
      if (newTask.isScheduled && newTask.recurrencePattern) {
        // Create scheduled task
        await createScheduledTask(newTask, currentUser.id, currentUser.name);
        if (onTaskFeedback) {
          onTaskFeedback('Scheduled task created successfully! Tasks will be generated automatically based on the recurrence pattern.', 'success');
        }
        // Log activity
        if (onLogActivity) {
          onLogActivity('create_scheduled', 'scheduled_task', 'temp', newTask.title, currentUser.id, currentUser.name, {
            departmentId: newTask.departmentId,
            assignedUserIds: newTask.assignedUserIds,
            difficulty: newTask.difficulty,
            isUrgent: newTask.isUrgent,
            recurrenceType: newTask.recurrencePattern.type,
            interval: newTask.recurrencePattern.interval
          });
        }
      } else {
        // Create regular task
        await addTask(newTask, currentUser.id, currentUser.name);
        if (onTaskFeedback) {
          onTaskFeedback('New task created successfully!', 'success');
        }
        // Log activity
        if (onLogActivity) {
          onLogActivity('create', 'task', newTask.id || 'temp', newTask.title, currentUser.id, currentUser.name, {
            departmentId: newTask.departmentId,
            assignedUserIds: newTask.assignedUserIds,
            difficulty: newTask.difficulty,
            isUrgent: newTask.isUrgent
          });
        }
      }
    } catch (error) {
      console.error('Error creating task:', error);
      if (onTaskFeedback) {
        const errorMessage = error.message || 'Unknown error';
        onTaskFeedback(`Failed to create ${newTask.isScheduled ? 'scheduled ' : ''}task: ${errorMessage}`, 'error');
      }
    }
  };
  
  const handleUpdateTask = async (patch) => {
    try {
      const oldTask = mergedTasks.find(t => t.id === patch.id);
      await updateTask(patch.id, patch, currentUser.id);
      if (onTaskFeedback) {
        onTaskFeedback('Task updated successfully!', 'success');
      }
      // Log activity
      if (onLogActivity && oldTask) {
        onLogActivity('update', 'task', patch.id, oldTask.title, currentUser.id, currentUser.name, {
          changes: Object.keys(patch).filter(key => key !== 'id'),
          oldValues: oldTask,
          newValues: patch
        });
      }
    } catch (error) {
      if (onTaskFeedback) {
        onTaskFeedback('Failed to update task. Please try again.', 'error');
      }
    }
  };

  // Function to update task locally without database update (for progressive loading)
  const handleUpdateTaskLocal = (patch) => {
    // For progressive loading, we'll store the update in local state
    // This will be merged with the tasks when rendering
    setLocalTaskUpdates(prev => ({
      ...prev,
      [patch.id]: { ...prev[patch.id], ...patch }
    }));
  };
  
  const handleDeleteTask = async (taskId, deleteReason = 'No reason provided') => {
    try {
      const task = mergedTasks.find(t => t.id === taskId);
      await deleteTask(taskId, currentUser?.id || 'system', currentUser?.name || currentUser?.username || 'System', deleteReason);
      if (onTaskFeedback) {
        onTaskFeedback('Task deleted successfully!', 'success');
      }
      // Log activity
      if (onLogActivity && task) {
        onLogActivity('soft_delete', 'task', taskId, task.title, currentUser.id, currentUser.name, {
          taskDetails: {
            status: task.status,
            departmentId: task.departmentId,
            assignedUserIds: task.assignedUserIds,
            deleteReason: deleteReason
          }
        });
      }
    } catch (error) {
      if (onTaskFeedback) {
        onTaskFeedback('Failed to delete task. Please try again.', 'error');
      }
    }
  };

  const handleCreateRequest = async (requestData) => {
    try {
      await createMaterialRequest(requestData, currentUser);
    } catch (error) {
      console.error('Error creating request:', error);
      alert('Failed to create request. Please try again.');
    }
  };

  const handleAddComment = async (taskId, commentText) => {
    try {
      const task = mergedTasks.find(t => t.id === taskId);
      if (!task) return;

      const newComment = {
        id: Date.now().toString(), // Simple ID generation
        text: commentText,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
        editedBy: currentUser.id,
        editedByName: currentUser.name
      };

      const updatedTask = {
        ...task,
        comments: [...(task.comments || []), newComment]
      };

      // Call updateTask with correct parameters: (taskId, patch, currentUserId)
      await updateTask(taskId, { comments: updatedTask.comments }, currentUser.id);
      
      // Log activity
      if (onLogActivity) {
        onLogActivity('comment', 'task', taskId, task.title, currentUser.id, currentUser.name, {
          commentText: commentText.substring(0, 100), // Log first 100 chars
          commentId: newComment.id
        });
      }

    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  // Handle comment deletion (admin only)
  const handleDeleteComment = async (taskId, commentId) => {
    try {
      // Find the task
      const task = mergedTasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found');
        return;
      }

      // Remove the comment from the task's comments array
      const updatedComments = (task.comments || []).filter(comment => comment?.id !== commentId);
      
      // Update the task with the new comments array
      await handleUpdateTask(taskId, { comments: updatedComments });

      console.log('Comment deleted successfully');
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  // Handle task approval (for self-assigned tasks)
  const handleApproveTask = async (taskId) => {
    try {
      const task = mergedTasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found');
        return;
      }

      // Update task with approval information
      await updateTask(taskId, {
        needsApproval: false,
        approvedBy: currentUser.id,
        approvedByName: currentUser.name,
        approvedAt: new Date().toISOString()
      }, currentUser.id);

      if (onTaskFeedback) {
        onTaskFeedback('Task approved successfully!', 'success');
      }

      // Log activity
      if (onLogActivity) {
        onLogActivity('approve_task', 'task', taskId, task.title, currentUser.id, currentUser.name, {
          approvedFor: task.assignedById,
          approvedForName: task.assignedByName
        });
      }
    } catch (error) {
      console.error('Error approving task:', error);
      if (onTaskFeedback) {
        onTaskFeedback('Failed to approve task. Please try again.', 'error');
      }
    }
  };

  // Handle rejecting a task
  const handleRejectTask = async (taskId) => {
    try {
      const task = mergedTasks.find(t => t.id === taskId);
      if (!task) {
        console.error('Task not found');
        return;
      }

      // Update task with rejection information
      await updateTask(taskId, {
        needsApproval: false,
        rejectedBy: currentUser.id,
        rejectedByName: currentUser.name,
        rejectedAt: new Date().toISOString(),
        status: 'Rejected'
      }, currentUser.id);

      if (onTaskFeedback) {
        onTaskFeedback('Task rejected successfully!', 'success');
      }

      // Log activity
      if (onLogActivity) {
        onLogActivity('reject_task', 'task', taskId, task.title, currentUser.id, currentUser.name, {
          rejectedFor: task.assignedById,
          rejectedForName: task.assignedByName
        });
      }
    } catch (error) {
      console.error('Error rejecting task:', error);
      if (onTaskFeedback) {
        onTaskFeedback('Failed to reject task. Please try again.', 'error');
      }
    }
  };

  // Handle editing a task (opens edit modal)
  const handleEditTask = (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      // Set the task for editing - this will open the edit modal
      setEditingTask(task);
      setIsEditTaskModalOpen(true);
    }
  };

  // Handle dismissing approval request
  const handleDismissApproval = (taskId) => {
    // Store dismissed approval in localStorage to prevent showing again
    const storageKey = `kartavya_dismissed_approval_${currentUser.id}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!existing.includes(taskId)) {
        existing.push(taskId);
        localStorage.setItem(storageKey, JSON.stringify(existing));
      }
    } catch (error) {
      console.error('Error storing dismissed approval:', error);
    }

    // Log activity
    if (onLogActivity) {
      const task = mergedTasks.find(t => t.id === taskId);
      if (task) {
        onLogActivity('dismiss_approval', 'task', taskId, task.title, currentUser.id, currentUser.name, {
          action: 'dismissed_approval_request'
        });
      }
    }
  };

  // Handle daily target update
  const handleUpdateTarget = async (newTarget) => {
    try {
      const updatedUser = { ...currentUser, dailyPointsTarget: newTarget };
      await updateUser(updatedUser, currentUser, currentUser);
      
      // Update the current user in the parent component if possible
      // Note: This assumes the parent component will refresh the user data
      console.log('Daily target updated to:', newTarget);
    } catch (error) {
      console.error('Error updating daily target:', error);
      alert('Failed to update daily target. Please try again.');
    }
  };

  
  // Improved task filtering logic
  const myTasks = (mergedTasks || []).filter((t) => {
    if (!t || !currentUser?.id) return false;

    // Hide deleted tasks from regular users (only admins can see them)
    if (t.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
      return false;
    }

    // Handle both array and single value cases for assignedUserIds
    if (Array.isArray(t.assignedUserIds)) {
      return t.assignedUserIds.includes(currentUser.id);
    } else if (t.assignedUserIds === currentUser.id) {
      return true;
    } else if (t.assignedUserId === currentUser.id) {
      return true;
    }
    return false;
  });

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dueSoonThreshold = new Date(now.getTime() + 3 * DAYS_IN_MS);

  const dueSoonTasks = myTasks.filter((task) => {
    if (!task || !task.targetDate) return false;
    if ([STATUSES.COMPLETE, STATUSES.DELETED].includes(task.status)) return false;
    const targetDate = parseDate(task.targetDate);
    if (!targetDate) return false;
    return targetDate >= startOfToday && targetDate <= dueSoonThreshold;
  });

  const staleTasks = myTasks.filter((task) => {
    if (!task) return false;
    if (![STATUSES.PENDING, STATUSES.ONGOING].includes(task.status)) return false;
    const lastUpdated = parseDate(task.updatedAt) || parseDate(task.createdAt);
    if (!lastUpdated) return false;
    return now.getTime() - lastUpdated.getTime() > 48 * HOURS_IN_MS;
  });

  const dueSoonTaskIds = useMemo(() => new Set(dueSoonTasks.map(task => task.id)), [dueSoonTasks]);
  const sortedDueSoonTasks = useMemo(() => {
    return [...dueSoonTasks].sort((a, b) => {
      const dateA = parseDate(a.targetDate);
      const dateB = parseDate(b.targetDate);
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    });
  }, [dueSoonTasks]);

  const sortedStaleTasks = useMemo(() => {
    return [...staleTasks].sort((a, b) => {
      const lastA = parseDate(a.updatedAt) || parseDate(a.createdAt);
      const lastB = parseDate(b.updatedAt) || parseDate(b.createdAt);
      if (!lastA && !lastB) return 0;
      if (!lastA) return 1;
      if (!lastB) return -1;
      return lastA.getTime() - lastB.getTime();
    });
  }, [staleTasks]);

  const nextTask = sortedStaleTasks[0] || sortedDueSoonTasks[0] || null;
  const nextTaskIsStale = nextTask ? staleTasks.some(task => task.id === nextTask.id) : false;
  const nextTaskTargetDate = nextTask ? parseDate(nextTask.targetDate) : null;
  const nextTaskLastTouched = nextTask ? (parseDate(nextTask.updatedAt) || parseDate(nextTask.createdAt)) : null;

  const prioritySignature = useMemo(() => {
    const dueSoonIds = dueSoonTasks.map(task => task.id).sort();
    const staleIds = staleTasks.map(task => task.id).sort();
    return JSON.stringify({ dueSoon: dueSoonIds, stale: staleIds });
  }, [dueSoonTasks, staleTasks]);

  const hasPriorityTasks = dueSoonTasks.length > 0 || staleTasks.length > 0;
  useEffect(() => {
    if (!hasPriorityTasks) {
      return;
    }
    if (dismissedSignature && dismissedSignature !== prioritySignature) {
      setDismissedSignature(null);
    }
  }, [prioritySignature, dismissedSignature, hasPriorityTasks]);

  const shouldShowPriorityPanel = hasPriorityTasks && dismissedSignature !== prioritySignature;
  const prioritySummaryParts = [];
  if (staleTasks.length > 0) {
    prioritySummaryParts.push(`${staleTasks.length} stale`);
  }
  if (dueSoonTasks.length > 0) {
    prioritySummaryParts.push(`${dueSoonTasks.length} due soon`);
  }
  const prioritySummary = prioritySummaryParts.join(' • ');
  const nextTaskTimeline = nextTask
    ? nextTaskIsStale
      ? (nextTaskLastTouched ? `Last update ${formatHoursAgo(now, nextTaskLastTouched)}` : null)
      : (nextTaskTargetDate ? formatDueTimeline(now, nextTaskTargetDate) : null)
    : null;
  const nextTaskStatusLabel = nextTask?.status
    ? t(nextTask.status.toLowerCase(), nextTask.status)
    : null;

  const logNudgeEngagement = useCallback(
    (task, context = {}) => {
      if (!currentUser?.id || !task) return;

      const safeName = currentUser.name || currentUser.username || 'Unknown';
      const details = {
        ...context,
        dueSoonCount: dueSoonTasks.length,
        staleCount: staleTasks.length,
      };

      if (onLogActivity) {
        onLogActivity('nudge_engagement', 'task', task.id, task.title || 'Task', currentUser.id, safeName, details);
        return;
      }

      logActivity('nudge_engagement', 'task', task.id, task.title || 'Task', currentUser.id, safeName, details).catch((error) => {
        console.error('Failed to log task nudge engagement', error);
      });
    },
    [currentUser, dueSoonTasks.length, staleTasks.length, onLogActivity]
  );

  const handlePriorityCta = useCallback(() => {
    if (!nextTask) return;

    const isStale = nextTaskIsStale;
    setStatusFilter([STATUSES.PENDING, STATUSES.ONGOING]);
    setShowDueSoonOnly(!isStale);

    if (typeof setOpenTaskId === 'function') {
      setOpenTaskId(nextTask.id);
    }

    logNudgeEngagement(nextTask, { action: isStale ? 'open_stale_task' : 'filter_due_soon' });
  }, [nextTask, nextTaskIsStale, setOpenTaskId, logNudgeEngagement, setStatusFilter, setShowDueSoonOnly]);

  const handleDismissPriorityPanel = useCallback(() => {
    if (!hasPriorityTasks) {
      return;
    }

    setDismissedSignature(prioritySignature);

    if (alertStorageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          alertStorageKey,
          JSON.stringify({
            signature: prioritySignature,
            dismissedAt: new Date().toISOString(),
          })
        );
      } catch (error) {
        console.error('Failed to persist priority panel dismissal', error);
      }
    }

    if (nextTask) {
      logNudgeEngagement(nextTask, { action: 'dismiss_panel' });
    }
  }, [hasPriorityTasks, prioritySignature, alertStorageKey, nextTask, logNudgeEngagement, setDismissedSignature]);

  // Search function for comprehensive task search
  const searchTasks = useCallback((tasks, query) => {
    if (!query.trim()) return tasks;
    
    const searchTerm = query.toLowerCase().trim();
    
    return tasks.filter((task) => {
      // Search in task title
      if (task.title?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in task description
      if (task.description?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in task notes
      if (task.notes && Array.isArray(task.notes)) {
        const notesText = task.notes.map(note => note?.text || '').join(' ').toLowerCase();
        if (notesText.includes(searchTerm)) return true;
      }
      
      // Search in assigned user names
      if (task.assignedUserIds && Array.isArray(task.assignedUserIds)) {
        const assignedUserNames = task.assignedUserIds
          .map(userId => {
            const user = users.find(u => u.id === userId);
            return user ? (user.name || user.username || '').toLowerCase() : '';
          })
          .join(' ');
        if (assignedUserNames.includes(searchTerm)) return true;
      }
      
      // Search in assigned by name
      if (task.assignedByName?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in department name
      if (task.departmentId) {
        const department = departments.find(d => d.id === task.departmentId);
        if (department?.name?.toLowerCase().includes(searchTerm)) return true;
      }
      
      // Search in task status
      if (task.status?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in task difficulty
      if (task.difficulty?.toLowerCase().includes(searchTerm)) return true;
      
      // Search in task points
      if (task.points?.toString().includes(searchTerm)) return true;
      
      // Search in target date (formatted)
      if (task.targetDate) {
        const targetDate = parseDate(task.targetDate);
        if (targetDate) {
          const formattedDate = targetDate.toLocaleDateString().toLowerCase();
          if (formattedDate.includes(searchTerm)) return true;
        }
      }
      
      // Search in creation date (formatted)
      if (task.createdAt) {
        const createdDate = parseDate(task.createdAt);
        if (createdDate) {
          const formattedDate = createdDate.toLocaleDateString().toLowerCase();
          if (formattedDate.includes(searchTerm)) return true;
        }
      }
      
      // Search in deletion reason (for deleted tasks)
      if (task.deleteReason?.toLowerCase().includes(searchTerm)) return true;
      
      return false;
    });
  }, [users, departments]);

  // Apply status filter and search to myTasks
  const filteredTasks = useMemo(() => {
    let filtered = myTasks.filter((task) => {
      const matchesStatus = statusFilter.length === 0 || statusFilter.includes(task.status);
      const matchesDueSoon = !showDueSoonOnly || dueSoonTaskIds.has(task.id);
      return matchesStatus && matchesDueSoon;
    });
    
    // Apply search filter
    filtered = searchTasks(filtered, searchQuery);
    
    return filtered;
  }, [myTasks, statusFilter, showDueSoonOnly, dueSoonTaskIds, searchTasks, searchQuery]);
  
  // Sorting helpers
  const getRelevantDate = (t) => {
    // Use robust parser that supports Firestore Timestamp and strings
    return (
      parseDate(t?.completedAt) ||
      parseDate(t?.updatedAt) ||
      parseDate(t?.createdAt) ||
      parseDate(t?.timestamp) ||
      null
    );
  };
  const getTaskPoints = (t) => {
    if (typeof t?.points === 'number') return t.points;
    return DIFFICULTY_CONFIG[t?.difficulty]?.points || 0;
  };
  

  // Calculate task statistics
  const taskStats = {
    pending: myTasks.filter(t => t && t.status === STATUSES.PENDING).length,
    ongoing: myTasks.filter(t => t && t.status === STATUSES.ONGOING).length,
    complete: myTasks.filter(t => t && t.status === STATUSES.COMPLETE).length,
    rejected: myTasks.filter(t => t && t.status === STATUSES.REJECTED).length,
    deleted: myTasks.filter(t => t && t.status === STATUSES.DELETED).length,
    total: myTasks.length
  };


  return (
    <div className="space-y-4 pb-20">
        <Section title={t('myTasks')}>
          {/* Approval Panel for Department Heads */}
          <ApprovalPanel
            tasks={tasks}
            currentUser={currentUser}
            users={users}
            onApprove={handleApproveTask}
            onReject={handleRejectTask}
            onEdit={handleEditTask}
            onDismiss={handleDismissApproval}
            t={t}
          />
          
          {shouldShowPriorityPanel && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600">⚡</span>
                    {t('taskAttention', 'Action needed')}
                  </div>
                  <p className="mt-1 text-xs text-amber-800">
                    {prioritySummary ? `You have ${prioritySummary}.` : t('taskAttentionHint', 'You have tasks that need your attention.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDismissPriorityPanel}
                  className="text-xs font-medium text-amber-700 transition-colors hover:text-amber-900"
                >
                  {t('dismiss', 'Dismiss')}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-amber-900">
                {dueSoonTasks.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    {dueSoonTasks.length} {t('dueSoon', 'due soon')}
                  </span>
                )}
                {staleTasks.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-3 py-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                    {staleTasks.length} {t('stale', 'stale')}
                  </span>
                )}
              </div>

              {nextTask && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3 shadow-inner">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                    {t('nextTask', 'Next task')}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-amber-900 line-clamp-2">
                    {nextTask.title || t('untitledTask', 'Untitled task')}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-700">
                    {nextTaskStatusLabel && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                        <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                        {nextTaskStatusLabel}
                      </span>
                    )}
                    {nextTaskTimeline && <span>{nextTaskTimeline}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={handlePriorityCta}
                    className="mt-3 inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
                  >
                    {nextTaskIsStale ? t('jumpToTask', 'Jump to task') : t('reviewDueSoon', 'Review due soon')}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Daily Points Progress Slider */}
          <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-800">Daily progress</div>
              {!isEditingTarget ? (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>{todayStats.points} / {sliderTarget} pts</span>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-indigo-100 text-slate-600"
                    title="Edit daily target"
                    onClick={() => { setTempTarget(String(sliderTarget)); setIsEditingTarget(true); }}
                  >
                    ✏️
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={tempTarget}
                    onChange={(e) => setTempTarget(e.target.value)}
                    min={1}
                    max={10000}
                    className="w-16 px-2 py-1 text-xs border border-slate-300 rounded"
                  />
                  <button
                    type="button"
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    onClick={async () => {
                      const v = parseInt(tempTarget, 10);
                      if (!isNaN(v) && v >= 1 && v <= 10000) {
                        await handleUpdateTarget(v);
                        setIsEditingTarget(false);
                      }
                    }}
                  >Save</button>
                  <button type="button" className="px-2 py-1 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded" onClick={() => setIsEditingTarget(false)}>Cancel</button>
                </div>
              )}
            </div>
            <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                style={{ width: `${sliderPct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
              <span>{sliderPct}%</span>
              {todayStats.points >= sliderTarget && (
                <span className="text-green-700 font-medium">Target achieved 🎉</span>
              )}
            </div>
          </div>

          <div className="relative mt-4">
            {isCelebratingBonus && !hasClaimedDailyBonus && (
              <>
                <span className="pointer-events-none absolute -top-2 left-6 h-3 w-3 rounded-full bg-pink-400/80 animate-ping"></span>
                <span className="pointer-events-none absolute -bottom-3 right-8 h-3 w-3 rounded-full bg-amber-300/80 animate-ping delay-150"></span>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="rounded-full bg-gradient-to-r from-amber-400 to-pink-500 px-3 py-1 text-sm font-semibold text-white shadow-lg animate-bounce">
                    +{DAILY_BONUS_POINTS}!
                  </span>
                </div>
              </>
            )}
            {!hasClaimedDailyBonus && (
              <button
                type="button"
                onClick={handleClaimDailyBonus}
                disabled={isClaimingBonus}
                className={`w-full transform rounded-lg px-4 py-2 text-base font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2 ${
                  'bg-brand-600 hover:bg-brand-700'
                } ${isClaimingBonus ? 'opacity-80 cursor-wait' : ''} ${isCelebratingBonus ? 'scale-105 shadow-lg' : 'shadow-md'}`}
              >
                <span>{t('claimDailyBonus', 'Claim Daily Bonus')}</span>
                <span className="text-sm font-bold">+{DAILY_BONUS_POINTS}</span>
                {isClaimingBonus && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent"></span>
                )}
              </button>
            )}
            {!hasClaimedDailyBonus && (
              <p className="mt-2 text-center text-xs text-slate-600">
                {t('dailyBonusHint', 'Tap once a day to grab an extra 25 points.')}
              </p>
            )}
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder={t('searchTasks') || 'Search tasks by title, description, assignee, department, status...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {searchQuery && (
              <p className="mt-1 text-xs text-gray-500">
                {t('searchResults') || 'Search results'}: {filteredTasks.length} {t('tasks') || 'tasks'} found
              </p>
            )}
          </div>

          {/* Filter Buttons */}
          <div className="mb-3">
              <div className="flex flex-wrap gap-1.5">
                <FilterButton
                  label={t('allTasks') || 'All Tasks'}
                  count={taskStats.total}
                  isActive={statusFilter.length === 0}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter([]);
                  }}
                />
                <FilterButton
                  label={t('pending') || 'Pending'}
                  count={taskStats.pending}
                  isActive={statusFilter.includes(STATUSES.PENDING)}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter(prev => prev.includes(STATUSES.PENDING) ? prev.filter(s => s !== STATUSES.PENDING) : [...prev, STATUSES.PENDING]);
                  }}
                />
                <FilterButton
                  label={t('ongoing') || 'Ongoing'}
                  count={taskStats.ongoing}
                  isActive={statusFilter.includes(STATUSES.ONGOING)}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter(prev => prev.includes(STATUSES.ONGOING) ? prev.filter(s => s !== STATUSES.ONGOING) : [...prev, STATUSES.ONGOING]);
                  }}
                />
                <FilterButton
                  label={t('dueSoon', 'Due soon')}
                  count={dueSoonTasks.length}
                  isActive={showDueSoonOnly}
                  onClick={() => {
                    setShowDueSoonOnly(prev => {
                      const next = !prev;
                      if (next) {
                        setStatusFilter([STATUSES.PENDING, STATUSES.ONGOING]);
                      }
                      return next;
                    });
                  }}
                />
                <FilterButton
                  label={t('completed') || 'Completed'}
                  count={taskStats.complete}
                  isActive={statusFilter.includes(STATUSES.COMPLETE)}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter(prev => prev.includes(STATUSES.COMPLETE) ? prev.filter(s => s !== STATUSES.COMPLETE) : [...prev, STATUSES.COMPLETE]);
                  }}
                />
                <FilterButton
                  label={t('rejected') || 'Rejected'}
                  count={taskStats.rejected}
                  isActive={statusFilter.includes(STATUSES.REJECTED)}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter(prev => prev.includes(STATUSES.REJECTED) ? prev.filter(s => s !== STATUSES.REJECTED) : [...prev, STATUSES.REJECTED]);
                  }}
                />
                <FilterButton
                  label={t('deleted') || 'Deleted'}
                  count={taskStats.deleted}
                  isActive={statusFilter.includes(STATUSES.DELETED)}
                  onClick={() => {
                    setShowDueSoonOnly(false);
                    setStatusFilter(prev => prev.includes(STATUSES.DELETED) ? prev.filter(s => s !== STATUSES.DELETED) : [...prev, STATUSES.DELETED]);
                  }}
                />
              </div>
            </div>

          {/* Removed duplicate DailyPointsTarget for cleaner UI */}

          {/* Task List with Progressive Loading */}
          {!isTasksLoaded ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-lg p-4 border border-slate-200 animate-pulse">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-3/4 h-5 bg-slate-200 rounded"></div>
                    <div className="w-16 h-4 bg-slate-200 rounded"></div>
                  </div>
                  <div className="w-full h-4 bg-slate-200 rounded mb-2"></div>
                  <div className="w-2/3 h-4 bg-slate-200 rounded mb-3"></div>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-6 bg-slate-200 rounded-full"></div>
                    <div className="w-16 h-6 bg-slate-200 rounded-full"></div>
                  </div>
                </div>
              ))}
              <div className="text-center py-4">
                <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-slate-500">Loading tasks...</p>
              </div>
            </div>
          ) : (
            <TaskList 
              tasks={filteredTasks} 
              allTasks={mergedTasks}
              onUpdateTask={handleUpdateTask} 
              onUpdateTaskLocal={handleUpdateTaskLocal}
              t={t} 
              currentUser={currentUser} 
              users={users} 
              departments={departments} 
              deleteTask={handleDeleteTask} 
              onCreateRequest={handleCreateRequest}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              openTaskId={openTaskId}
            />
          )}

        </Section>
      
        <Section title={t('createTask')}>
          <button
            onClick={() => setIsCreateTaskOpen(true)}
            className="w-full btn btn-primary"
          >
            <span className="inline-flex items-center gap-2">
              <PlusIcon className="text-white" />
              {t('newTask')}
            </span>
          </button>
        </Section>

        {/* Scheduled Tasks Section */}
        <Section title={t('scheduledTasks') || 'Scheduled Tasks'}>
          <div className="mb-4">
            <button
              onClick={async () => {
                setIsSyncing(true);
                try {
                  const result = await triggerScheduledTasks();
                  const processed = result?.processed ?? 0;
                  let feedbackMessage = result?.message || 'Scheduled tasks synced successfully!';

                  if (processed > 0) {
                    const suffix = processed === 1 ? 'task' : 'tasks';
                    feedbackMessage = `${feedbackMessage} (${processed} ${suffix} created)`;
                  }

                  onTaskFeedback(feedbackMessage, 'success');
                } catch (error) {
                  onTaskFeedback('Failed to sync scheduled tasks.', 'error');
                } finally {
                  setIsSyncing(false);
                }
              }}
              className="w-full btn btn-secondary flex items-center justify-center gap-2"
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>{t('syncing', 'Syncing...')}</span>
                </>
              ) : (
                <span>{t('syncScheduledTasks', 'Sync Scheduled Tasks')}</span>
              )}
            </button>
            <p className="text-xs text-slate-500 mt-2 text-center">
              {t('scheduledTasksHint', 'Click here to manually check for and create tasks from your schedules. This should happen automatically, but can be used if tasks are missing.')}
            </p>
          </div>
          <ScheduledTasksList
            currentUser={currentUser}
            users={users}
            departments={departments}
            t={t}
            onTaskFeedback={onTaskFeedback}
            onLogActivity={onLogActivity}
          />
        </Section>

        {/* Create Task Modal */}
        {isCreateTaskOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">{t('createTask')}</h3>
                <button
                  onClick={() => setIsCreateTaskOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="p-6">
                <TaskForm
                  currentUser={currentUser}
                  users={users}
                  departments={departments}
                  onCreate={handleAddTask}
                  t={t}
                  onCancel={() => setIsCreateTaskOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Edit Task Modal */}
        {isEditTaskModalOpen && editingTask && (
          <EditTaskModal
            task={editingTask}
            currentUser={currentUser}
            users={users}
            departments={departments}
            onSave={handleUpdateTask}
            onDelete={(taskId, deleteReason) => handleDeleteTask(taskId, deleteReason)}
            onClose={() => {
              setIsEditTaskModalOpen(false);
              setEditingTask(null);
            }}
            t={t}
          />
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setIsCreateTaskOpen(true)}
          className="fixed bottom-20 right-6 w-14 h-14 bg-brand-600 hover:bg-brand-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 z-50 flex items-center justify-center text-4xl font-bold leading-none"
          title={t('createTask')}
        >
          +
        </button>
    </div>
  );
}

export default TasksTab;
