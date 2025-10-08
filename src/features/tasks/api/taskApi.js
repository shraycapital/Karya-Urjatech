// ⚠️ CRITICAL: All dates in this app use Firestore timestamp format
// Format: { seconds: number, nanoseconds: number }
// See FIRESTORE_TIMESTAMP_GUIDE.md for complete documentation

import { db } from '../../../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc, Timestamp } from 'firebase/firestore';
import { toISTISOString } from '../../../shared/utils/date';
import { logTaskActivity, logActivity } from '../../../shared/utils/activityLogger';

const TASKS_COLLECTION = 'tasks'; // Primary collection
const TASKS_COLLECTION_UPPER = 'Tasks'; // Backup collection

// Helper function to get the primary collection
const getPrimaryCollection = () => collection(db, TASKS_COLLECTION);

// Helper function to get the backup collection
const getBackupCollection = () => collection(db, TASKS_COLLECTION_UPPER);

export const subscribeTasks = (onChange, options = {}) => {
  const { progressive = true, loadHeavyItems = false } = options;
  
  let currentPrimary = [];
  let currentBackup = [];
  const emit = () => {
    const map = new Map();
    currentBackup.forEach(t => map.set(t.id, t));
    currentPrimary.forEach(t => map.set(t.id, t)); // prefer primary
    
    // If progressive loading is enabled, strip heavy items from initial load
    const tasks = Array.from(map.values()).map(task => {
      if (progressive && !loadHeavyItems) {
        return {
          ...task,
          // Keep basic info for fast loading
          photos: task.photos ? [] : [], // Empty array for photos initially
          comments: task.comments ? [] : [], // Empty array for comments initially
          // Keep detailed notes but limit to first note for initial display
          notes: task.notes && Array.isArray(task.notes) ? [task.notes[0]] : [],
          _progressiveLoaded: false // Flag to track progressive loading state
        };
      }
      return { ...task, _progressiveLoaded: true };
    });
    
    onChange(tasks);
  };

  (async () => {
    try {
      const [primarySnap, backupSnap] = await Promise.all([
        getDocs(getPrimaryCollection()).catch(() => ({ docs: [] })),
        getDocs(getBackupCollection()).catch(() => ({ docs: [] }))
      ]);
      currentPrimary = primarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      currentBackup = backupSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      emit();
    } catch {
      onChange([]);
    }
  })();

  const unsub1 = onSnapshot(getPrimaryCollection(), (snap) => {
    currentPrimary = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  });
  const unsub2 = onSnapshot(getBackupCollection(), (snap) => {
    currentBackup = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  });

  return () => { unsub1(); unsub2(); };
};

// Function to load heavy items (photos, full notes, comments) for specific tasks
export const loadTaskHeavyItems = async (taskIds) => {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return [];
  
  try {
    const tasksWithHeavyItems = [];
    
    for (const taskId of taskIds) {
      // Try primary collection first
      let taskDoc = null;
      try {
        const primaryDoc = await getDoc(doc(db, TASKS_COLLECTION, taskId));
        if (primaryDoc.exists()) {
          taskDoc = primaryDoc;
        }
      } catch (error) {
        console.log('Primary collection fetch failed for task:', taskId);
      }
      
      // Try backup collection if primary failed
      if (!taskDoc) {
        try {
          const backupDoc = await getDoc(doc(db, TASKS_COLLECTION_UPPER, taskId));
          if (backupDoc.exists()) {
            taskDoc = backupDoc;
          }
        } catch (error) {
          console.log('Backup collection fetch failed for task:', taskId);
        }
      }
      
      if (taskDoc) {
        const taskData = taskDoc.data();
        tasksWithHeavyItems.push({
          id: taskId,
          photos: taskData.photos || [],
          comments: taskData.comments || [],
          notes: taskData.notes || [],
          _progressiveLoaded: true
        });
      }
    }
    
    return tasksWithHeavyItems;
  } catch (error) {
    console.error('Error loading heavy items for tasks:', error);
    return [];
  }
};

export const createTask = async (taskData, currentUserId, currentUserName) => {
  // Robust check: Ensure we have a valid user ID and name before creating a task.
  if (!currentUserId || !currentUserName || currentUserName === 'Unknown') {
    console.error('Task creation blocked: Missing user ID or name.', { currentUserId, currentUserName });
    throw new Error('A valid user ID and name are required to create a task.');
  }

  if (!taskData?.title || !taskData?.departmentId || !Array.isArray(taskData.assignedUserIds) || taskData.assignedUserIds.length === 0) {
    throw new Error('Missing required fields: title, departmentId, assignedUserIds');
  }
  
  // Check if user is assigning task to themselves (self-assignment)
  // This includes cases where they assign to themselves AND others
  const isSelfAssigned = taskData.assignedUserIds.includes(currentUserId);
  
  // Get user role to determine if approval is needed
  // Heads, Management, and Admins don't need approval for their self-assigned tasks
  const needsApproval = isSelfAssigned && 
    taskData.assignedUserRole !== 'Head' && 
    taskData.assignedUserRole !== 'Management' && 
    taskData.assignedUserRole !== 'Admin';
  
  const payload = {
    ...taskData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedById: currentUserId,
    assignedById: currentUserId,
    assignedByName: currentUserName,
    originalAssignedById: currentUserId,
    originalAssignedByName: currentUserName,
    startedAt: taskData.startedAt || null,
    completedAt: taskData.completedAt || null,
    notes: taskData.notes || [],
    photos: taskData.photos || [],
    notifiedUsers: taskData.notifiedUsers || [],
    status: taskData.status || 'Pending',
    assignedUserIds: taskData.assignedUserIds || [],
    isUrgent: taskData.isUrgent || false,
    targetDate: taskData.targetDate || null,
    type: taskData.type || null,
    originalTaskId: taskData.originalTaskId || null,
    originalTaskTitle: taskData.originalTaskTitle || null,
    requestingDepartmentId: taskData.requestingDepartmentId || null,
    requestingUserId: taskData.requestingUserId || null,
    requestingUserName: taskData.requestingUserName || null,
    isBlocking: taskData.isBlocking || false,
    originalAssignedUsers: taskData.originalAssignedUsers || [],
    difficulty: taskData.difficulty || null,
    points: taskData.points || null,
    // Self-assigned tasks need approval from department heads (except for Heads, Management, Admins)
    needsApproval: needsApproval,
    approvedBy: null,
    approvedAt: null,
    approvedByName: null,
  };
  const res = await addDoc(getPrimaryCollection(), payload);
  
  // Log task creation activity
  try {
    await logTaskActivity('create', { ...payload, id: res.id }, currentUserId, currentUserName, {
      assignedUserCount: taskData.assignedUserIds?.length || 0,
      isUrgent: taskData.isUrgent || false,
      hasTargetDate: !!taskData.targetDate,
      taskType: taskData.type || 'regular'
    });
  } catch (error) {
    console.warn('Failed to log task creation activity:', error);
  }
  
  return res.id;
};

export const patchTask = async (taskId, updates = {}, currentUserId, currentUserName = 'Unknown') => {
  // Get the current task data for logging
  let currentTask = null;
  try {
    const taskRef = doc(getPrimaryCollection(), taskId);
    const taskSnap = await getDoc(taskRef);
    if (taskSnap.exists()) {
      currentTask = { id: taskSnap.id, ...taskSnap.data() };
    }
  } catch (error) {
    console.warn('Failed to get current task for logging:', error);
  }

  // Resolve user identity defensively
  const effectiveUserId = currentUserId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kartavya_userId') : null) || 'system';
  const effectiveUserName = currentUserName || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kartavya_userName') || 'Unknown') : 'Unknown');

  // Clean undefined values from updates
  const cleanUpdates = Object.fromEntries(
    Object.entries(updates).filter(([key, value]) => value !== undefined)
  );
  
  const data = { ...cleanUpdates, updatedAt: serverTimestamp(), updatedById: effectiveUserId };
  if (updates.status === 'Ongoing' && !updates.startedAt) data.startedAt = serverTimestamp();
  if (updates.status === 'Complete' && !updates.completedAt) data.completedAt = serverTimestamp();
  if (updates.status === 'Pending') {
    data.startedAt = null;
    data.completedAt = null;
  }
  // If assignment changed, stamp assignedBy as the actor performing the change
  // But preserve the original assignedBy fields
  if (Object.prototype.hasOwnProperty.call(cleanUpdates, 'assignedUserIds')) {
    data.assignedById = effectiveUserId;
    data.assignedByName = effectiveUserName;
    // Don't update originalAssignedById and originalAssignedByName - they should remain unchanged
  }
  
  await updateDoc(doc(getPrimaryCollection(), taskId), data);
  
  // Log task update activity
  if (currentTask) {
    try {
      const action = cleanUpdates.status ? 
        (cleanUpdates.status === 'Ongoing' ? 'start' : 
         cleanUpdates.status === 'Complete' ? 'complete' : 
         cleanUpdates.status === 'Pending' ? 'reopen' : 'update') : 'update';
      
      await logTaskActivity(action, currentTask, effectiveUserId, effectiveUserName, {
        changes: Object.keys(cleanUpdates),
        previousStatus: currentTask.status,
        newStatus: cleanUpdates.status || currentTask.status,
        previousValues: currentTask,
        newValues: cleanUpdates
      });
    } catch (error) {
      console.warn('Failed to log task update activity:', error);
    }
  }
};

export const removeTask = async (taskId, currentUserId = 'system', currentUserName = 'System', deleteReason = 'No reason provided') => {
  if (deleteReason === undefined || deleteReason === null) {
    deleteReason = 'No reason provided';
  }

  // Get the current task data for logging
  let currentTask = null;
  try {
    const taskRef = doc(getPrimaryCollection(), taskId);
    const taskSnap = await getDoc(taskRef);
    if (taskSnap.exists()) {
      currentTask = { id: taskSnap.id, ...taskSnap.data() };
    }
  } catch (error) {
    console.warn('Failed to get current task for logging:', error);
  }

  // Instead of deleting, mark as deleted with reason
  if (currentTask) {
    const deletedAt = new Date();
    const deleteNote = `Task deleted on ${deletedAt.toLocaleDateString()} at ${deletedAt.toLocaleTimeString()} by ${currentUserName}. Reason: ${deleteReason}`;

    // Add the deletion note to existing notes array
    const existingNotes = Array.isArray(currentTask.notes) ? currentTask.notes : [];
    const updatedNotes = [
      ...existingNotes,
      {
        text: deleteNote,
        type: 'deletion',
        timestamp: new Date().toISOString(),
        userId: currentUserId,
        userName: currentUserName
      }
    ];

    // Update the task with deleted status and reason
    const updateData = {
      status: 'Deleted',
      deletedAt: serverTimestamp(),
      deletedBy: currentUserId,
      deletedByName: currentUserName,
      deleteReason: deleteReason,
      notes: updatedNotes
    };

    await updateDoc(doc(getPrimaryCollection(), taskId), updateData);

    console.debug('Task delete update payload', { taskId, updateData });

    // Log task deletion activity
    try {
      await logTaskActivity('soft_delete', currentTask, currentUserId, currentUserName, {
        taskStatus: currentTask.status,
        taskDifficulty: currentTask.difficulty,
        taskPoints: currentTask.points,
        assignedUserCount: currentTask.assignedUserIds?.length || 0,
        deleteReason: deleteReason
      });
    } catch (error) {
      console.warn('Failed to log task deletion activity:', error);
    }
  }
};

export const getTask = async (taskId) => {
  const ref = doc(getPrimaryCollection(), taskId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Scheduled Tasks API Functions
const SCHEDULED_TASKS_COLLECTION = 'scheduledTasks';

export const createScheduledTask = async (taskData, currentUserId, currentUserName) => {
  try {
    if (!currentUserId || !currentUserName || currentUserName === 'Unknown') {
      console.error('Scheduled task creation blocked: Missing user ID or name.', { currentUserId, currentUserName });
      throw new Error('A valid user ID and name are required to create a scheduled task.');
    }

    if (!taskData?.title || !taskData?.departmentId || !Array.isArray(taskData.assignedUserIds) || taskData.assignedUserIds.length === 0) {
      throw new Error('Missing required fields: title, departmentId, assignedUserIds');
    }

    if (!taskData?.recurrencePattern) {
      throw new Error('Recurrence pattern is required for scheduled tasks');
    }

    // Validate recurrence pattern
    const { type, interval, weekdays, monthlyType, monthlyDay, monthlyWeekday, monthlyWeekdayName, regenerateAfter, range } = taskData.recurrencePattern;
    
    if (!type || !['daily', 'weekly', 'monthly', 'yearly'].includes(type)) {
      throw new Error('Invalid recurrence type');
    }
    
    if (!interval || interval < 1) {
      throw new Error('Invalid recurrence interval');
    }
    
    if (type === 'weekly' && (!weekdays || weekdays.length === 0)) {
      throw new Error('Weekly recurrence requires at least one weekday selected');
    }

  // Calculate first occurrence date
  const startDate = new Date(taskData.scheduledStartDate || taskData.targetDate);
  const firstOccurrence = new Date(startDate);
  
  // For weekly tasks, find the next occurrence of selected weekdays
  if (taskData.recurrencePattern.type === 'weekly' && taskData.recurrencePattern.weekdays) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const weekdays = taskData.recurrencePattern.weekdays;
    
    // Find next occurrence of any selected weekday
    let found = false;
    for (let i = 0; i <= 7 * taskData.recurrencePattern.interval; i++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(startDate.getDate() + i);
      const dayName = dayNames[checkDate.getDay()];
      
      if (weekdays.includes(dayName)) {
        firstOccurrence.setTime(checkDate.getTime());
        found = true;
        break;
      }
    }
    
    if (!found) {
      // If no weekday found, use start date
      firstOccurrence.setTime(startDate.getTime());
    }
  }

  const scheduledTaskData = {
    title: taskData.title,
    description: taskData.description || '',
    assignedUserIds: taskData.assignedUserIds,
    assignedById: currentUserId,
    assignedByName: currentUserName,
    departmentId: taskData.departmentId,
    difficulty: taskData.difficulty,
    points: taskData.points,
    notes: taskData.notes || [],
    photos: taskData.photos || [],
    isUrgent: taskData.isUrgent || false,
    recurrencePattern: JSON.parse(JSON.stringify(taskData.recurrencePattern)), // Deep clone and remove undefined
    nextOccurrence: Timestamp.fromDate(firstOccurrence),
    occurrenceCount: 0,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdById: currentUserId,
    createdByName: currentUserName,
  };

  const res = await addDoc(collection(db, SCHEDULED_TASKS_COLLECTION), scheduledTaskData);
  
  // Log scheduled task creation activity
  try {
    await logTaskActivity('create_scheduled', { ...scheduledTaskData, id: res.id }, currentUserId, currentUserName, {
      recurrenceType: taskData.recurrencePattern.type,
      interval: taskData.recurrencePattern.interval,
      assignedUserCount: taskData.assignedUserIds?.length || 0,
      isUrgent: taskData.isUrgent || false,
      firstOccurrence: firstOccurrence.toISOString()
    });
  } catch (error) {
    console.warn('Failed to log scheduled task creation activity:', error);
  }
  
    return res.id;
  } catch (error) {
    console.error('Error creating scheduled task:', error);
    throw new Error(`Failed to create scheduled task: ${error.message}`);
  }
};

export const subscribeScheduledTasks = (onChange) => {
  const scheduledTasksRef = collection(db, SCHEDULED_TASKS_COLLECTION);
  
  return onSnapshot(scheduledTasksRef, (snap) => {
    const scheduledTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onChange(scheduledTasks);
  });
};

export const updateScheduledTask = async (scheduledTaskId, updates = {}, currentUserId, currentUserName = 'Unknown') => {
  const effectiveUserId = currentUserId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kartavya_userId') : null) || 'system';
  const effectiveUserName = currentUserName || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kartavya_userName') || 'Unknown') : 'Unknown');

  const data = { 
    ...updates, 
    updatedAt: serverTimestamp(), 
    updatedById: effectiveUserId 
  };
  
  await updateDoc(doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId), data);
  
  // Log scheduled task update activity
  try {
    await logTaskActivity('update_scheduled', { id: scheduledTaskId, ...updates }, effectiveUserId, effectiveUserName, {
      changes: Object.keys(updates),
      scheduledTaskId: scheduledTaskId
    });
  } catch (error) {
    console.warn('Failed to log scheduled task update activity:', error);
  }
};

export const deleteScheduledTask = async (scheduledTaskId, currentUserId = 'system', currentUserName = 'System') => {
  // Get the current scheduled task data for logging
  let currentScheduledTask = null;
  try {
    const scheduledTaskRef = doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId);
    const scheduledTaskSnap = await getDoc(scheduledTaskRef);
    if (scheduledTaskSnap.exists()) {
      currentScheduledTask = { id: scheduledTaskSnap.id, ...scheduledTaskSnap.data() };
    }
  } catch (error) {
    console.warn('Failed to get current scheduled task for logging:', error);
  }

  await deleteDoc(doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId));
  
  // Log scheduled task deletion activity
  if (currentScheduledTask) {
    try {
      await logTaskActivity('delete_scheduled', currentScheduledTask, currentUserId, currentUserName, {
        scheduledTaskId: scheduledTaskId,
        recurrenceType: currentScheduledTask.recurrencePattern?.type,
        occurrenceCount: currentScheduledTask.occurrenceCount || 0
      });
    } catch (error) {
      console.warn('Failed to log scheduled task deletion activity:', error);
    }
  }
};

export const getScheduledTask = async (scheduledTaskId) => {
  const ref = doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const triggerScheduledTasks = async () => {
  try {
    // Get the Firebase project ID from the config
    const projectId = 'kartavya-58d2c'; // You may want to get this from environment variables
    const region = 'asia-south2';
    const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/processScheduledTasksHttp`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error triggering scheduled tasks:', error);
    throw new Error('Failed to trigger scheduled tasks processing.');
  }
};



