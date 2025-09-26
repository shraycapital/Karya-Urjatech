import React, { useState, useEffect } from 'react';
import { subscribeScheduledTasks, deleteScheduledTask, updateScheduledTask } from '../api/taskApi';
import { DIFFICULTY_CONFIG } from '../../../shared/constants';

const ClockIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);

const CalendarIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const RepeatIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="17,1 21,5 17,9"/>
    <path d="M3,11V9a4,4,0,0,1,4-4H21"/>
    <polyline points="7,23 3,19 7,15"/>
    <path d="M21,13v2a4,4,0,0,1-4,4H3"/>
  </svg>
);

const TrashIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="3,6 5,6 21,6"/>
    <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/>
  </svg>
);

const PauseIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>
  </svg>
);

const PlayIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polygon points="5,3 19,12 5,21"/>
  </svg>
);

export default function ScheduledTasksList({ currentUser, users, departments, t = (key) => key, onTaskFeedback, onLogActivity }) {
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeScheduledTasks((tasks) => {
      // Filter scheduled tasks for current user's departments
      const userDepartmentIds = currentUser.departmentIds || [];
      const filteredTasks = tasks.filter(task => 
        userDepartmentIds.includes(task.departmentId) || 
        currentUser.role === 'Admin'
      );
      setScheduledTasks(filteredTasks);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const formatRecurrenceSummary = (recurrencePattern) => {
    if (!recurrencePattern) return 'No pattern';
    
    let summary = '';
    
    switch (recurrencePattern.type) {
      case 'daily':
        summary = `Every ${recurrencePattern.interval} day${recurrencePattern.interval > 1 ? 's' : ''}`;
        break;
      case 'weekly':
        const weekdayNames = {
          monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
          friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
        };
        const weekdays = (recurrencePattern.weekdays || []).map(w => weekdayNames[w] || w).join(', ');
        summary = `Every ${recurrencePattern.interval} week${recurrencePattern.interval > 1 ? 's' : ''} on ${weekdays}`;
        break;
      case 'monthly':
        if (recurrencePattern.monthlyType === 'day') {
          summary = `Day ${recurrencePattern.monthlyDay} of every ${recurrencePattern.interval} month${recurrencePattern.interval > 1 ? 's' : ''}`;
        } else if (recurrencePattern.monthlyType === 'weekday') {
          const weekOptions = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', last: 'Last' };
          const weekdayNames = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
          summary = `${weekOptions[recurrencePattern.monthlyWeekday]} ${weekdayNames[recurrencePattern.monthlyWeekdayName]} of every ${recurrencePattern.interval} month${recurrencePattern.interval > 1 ? 's' : ''}`;
        } else {
          summary = `Regenerate ${recurrencePattern.regenerateAfter} month${recurrencePattern.regenerateAfter > 1 ? 's' : ''} after completion`;
        }
        break;
      case 'yearly':
        summary = `Every ${recurrencePattern.interval} year${recurrencePattern.interval > 1 ? 's' : ''}`;
        break;
    }

    // Add range information
    if (recurrencePattern.range) {
      if (recurrencePattern.range.type === 'end_by' && recurrencePattern.range.endDate) {
        summary += ` until ${new Date(recurrencePattern.range.endDate).toLocaleDateString()}`;
      } else if (recurrencePattern.range.type === 'end_after' && recurrencePattern.range.occurrences) {
        summary += ` for ${recurrencePattern.range.occurrences} occurrence${recurrencePattern.range.occurrences > 1 ? 's' : ''}`;
      }
    }

    return summary;
  };

  const formatNextOccurrence = (nextOccurrence) => {
    if (!nextOccurrence) return 'Not scheduled';
    
    const date = nextOccurrence.toDate ? nextOccurrence.toDate() : new Date(nextOccurrence);
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'Overdue';
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffDays <= 7) {
      return `In ${diffDays} days`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleToggleActive = async (scheduledTask) => {
    try {
      await updateScheduledTask(
        scheduledTask.id, 
        { isActive: !scheduledTask.isActive }, 
        currentUser.id, 
        currentUser.name
      );
      
      if (onTaskFeedback) {
        onTaskFeedback(
          `Scheduled task ${scheduledTask.isActive ? 'paused' : 'resumed'} successfully!`, 
          'success'
        );
      }
      
      if (onLogActivity) {
        onLogActivity(
          scheduledTask.isActive ? 'pause_scheduled' : 'resume_scheduled',
          'scheduled_task',
          scheduledTask.id,
          scheduledTask.title,
          currentUser.id,
          currentUser.name,
          { isActive: !scheduledTask.isActive }
        );
      }
    } catch (error) {
      console.error('Error toggling scheduled task:', error);
      if (onTaskFeedback) {
        onTaskFeedback('Failed to update scheduled task. Please try again.', 'error');
      }
    }
  };

  const handleDeleteScheduledTask = async (scheduledTask) => {
    if (!window.confirm(`Are you sure you want to delete the scheduled task "${scheduledTask.title}"? This will stop all future occurrences.`)) {
      return;
    }

    try {
      await deleteScheduledTask(scheduledTask.id, currentUser.id, currentUser.name);
      
      if (onTaskFeedback) {
        onTaskFeedback('Scheduled task deleted successfully!', 'success');
      }
      
      if (onLogActivity) {
        onLogActivity(
          'delete_scheduled',
          'scheduled_task',
          scheduledTask.id,
          scheduledTask.title,
          currentUser.id,
          currentUser.name,
          { 
            recurrenceType: scheduledTask.recurrencePattern?.type,
            occurrenceCount: scheduledTask.occurrenceCount || 0
          }
        );
      }
    } catch (error) {
      console.error('Error deleting scheduled task:', error);
      if (onTaskFeedback) {
        onTaskFeedback('Failed to delete scheduled task. Please try again.', 'error');
      }
    }
  };

  const getAssignedUserNames = (assignedUserIds) => {
    if (!Array.isArray(assignedUserIds) || assignedUserIds.length === 0) return 'Unassigned';
    return assignedUserIds.map(id => users.find(u => u.id === id)?.name || 'Unknown').join(', ');
  };

  const getDepartmentName = (departmentId) => {
    return departments.find(d => d.id === departmentId)?.name || 'Unknown Department';
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-600">Loading scheduled tasks...</p>
      </div>
    );
  }

  if (scheduledTasks.length === 0) {
    return (
      <div className="text-center py-8">
        <ClockIcon size={48} className="mx-auto text-slate-400 mb-4" />
        <p className="text-slate-600 mb-2">No scheduled tasks found</p>
        <p className="text-sm text-slate-500">Create a scheduled task to see it here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scheduledTasks.map((scheduledTask) => (
        <div
          key={scheduledTask.id}
          className={`bg-white rounded-lg border p-4 transition-all ${
            scheduledTask.isActive 
              ? 'border-blue-200 shadow-sm hover:shadow-md' 
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-slate-800 truncate">
                  {scheduledTask.title}
                </h3>
                {scheduledTask.isUrgent && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    🚨 Urgent
                  </span>
                )}
                {!scheduledTask.isActive && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                    ⏸️ Paused
                  </span>
                )}
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <RepeatIcon size={14} className="text-blue-500" />
                  <span>{formatRecurrenceSummary(scheduledTask.recurrencePattern)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <CalendarIcon size={14} className="text-green-500" />
                  <span>Next: {formatNextOccurrence(scheduledTask.nextOccurrence)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <ClockIcon size={14} className="text-purple-500" />
                  <span>Occurrences: {scheduledTask.occurrenceCount || 0}</span>
                </div>

                <div className="text-xs text-slate-500">
                  <div>Assigned to: {getAssignedUserNames(scheduledTask.assignedUserIds)}</div>
                  <div>Department: {getDepartmentName(scheduledTask.departmentId)}</div>
                  <div>Difficulty: {DIFFICULTY_CONFIG[scheduledTask.difficulty]?.label || scheduledTask.difficulty} ({scheduledTask.points} pts)</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 ml-4">
              <button
                onClick={() => handleToggleActive(scheduledTask)}
                className={`p-2 rounded-lg transition-colors ${
                  scheduledTask.isActive
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-green-600 hover:bg-green-50'
                }`}
                title={scheduledTask.isActive ? 'Pause scheduled task' : 'Resume scheduled task'}
              >
                {scheduledTask.isActive ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              </button>

              <button
                onClick={() => handleDeleteScheduledTask(scheduledTask)}
                className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                title="Delete scheduled task"
              >
                <TrashIcon size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}











