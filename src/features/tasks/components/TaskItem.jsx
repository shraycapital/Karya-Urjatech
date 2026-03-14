import React from 'react';
import { DIFFICULTY_CONFIG, DIFFICULTY_LEVELS } from '../../../shared/constants';

export default function TaskItem({
  task,
  STATUSES,
  onStart,
  onFinish,
  onToggleExpand,
  expanded,
  t,
  isReadOnly,
  blockingTasks = [],
  currentUser,
  selectionMode = false,
  isSelected = false,
  isSelectable = true,
  onToggleSelect,
}) {
  // Check if this task has blocking material requests
  const hasBlockingRequests = task.hasBlockingTasks || false;

  const isCurrentUserObserver =
    !!currentUser?.id &&
    Array.isArray(task.observerIds) &&
    task.observerIds.includes(currentUser.id);

  const isCurrentUserAssigned =
    !!currentUser?.id &&
    Array.isArray(task.assignedUserIds) &&
    task.assignedUserIds.includes(currentUser.id);

  // Observer-only users can view/comment/edit, but must not change status/progress
  const isObserverOnly = isCurrentUserObserver && !isCurrentUserAssigned;

  // Get difficulty config for display with backward compatibility
  // Default to HARD (50 pts) for existing tasks without difficulty
  const difficultyConfig = task.difficulty 
    ? DIFFICULTY_CONFIG[task.difficulty] 
    : DIFFICULTY_CONFIG[DIFFICULTY_LEVELS.HARD];

  // Calculate actual points user will receive for this task
  const calculateUserPoints = (task) => {
    let basePoints;
    
    if (task.points && typeof task.points === 'number') {
      basePoints = task.points;
    } else if (task.difficulty) {
      basePoints = DIFFICULTY_CONFIG[task.difficulty].points;
    } else {
      // For existing tasks without difficulty, default to HARD (50 pts)
      basePoints = 50;
    }

    const assignedUserCount = task.assignedUserIds?.length || 1;
    const basePointsPerUser = Math.round(basePoints / assignedUserCount);
    
    // Collaboration bonus (10% for team tasks)
    const collaborationBonus = assignedUserCount > 1 ? Math.round(basePointsPerUser * 0.1) : 0;
    
    // Urgent bonus (25% for urgent tasks)
    const urgentBonus = task.isUrgent ? Math.round(basePointsPerUser * 0.25) : 0;
    
    // Legacy urgent bonus (for old tasks)
    const legacyUrgentBonus = task.urgent ? 5 : 0;
    
    // On-time bonus (3 points for completing before target date)
    const onTimeBonus = task.completedAt && task.targetDate && 
      new Date(task.completedAt) <= new Date(task.targetDate) ? 3 : 0;
    
    return basePointsPerUser + collaborationBonus + urgentBonus + legacyUrgentBonus + onTimeBonus;
  };

  const actualUserPoints = isObserverOnly ? 0 : calculateUserPoints(task);

  return (
    <li
      className={`rounded-lg border cursor-pointer transition-all duration-200 ${
        isSelected ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-200' : 'bg-slate-50'
      }`}
      onClick={onToggleExpand}
    >
      <div className="px-3 py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {selectionMode && (
              <label
                className={`flex items-center justify-center ${isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                onClick={(e) => e.stopPropagation()}
                title={isSelectable ? (t('selectTask', 'Select task')) : (t('taskCannotBeBulkDeleted', 'This task cannot be bulk deleted'))}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={isSelected}
                  disabled={!isSelectable}
                  onChange={() => {
                    if (isSelectable && typeof onToggleSelect === 'function') {
                      onToggleSelect(task.id);
                    }
                  }}
                />
              </label>
            )}
            {hasBlockingRequests && (
              <span className="text-red-600 text-sm" title="Task is blocked by pending material requests">🔒</span>
            )}
            <div className="font-medium">{task.title}</div>
          </div>
          
          {/* Show first note below task title */}
          {task.notes && Array.isArray(task.notes) && task.notes.length > 0 && task.notes[0]?.text && (
            <div className="text-sm text-slate-600 mt-1 line-clamp-1">
              {task.notes[0].text}
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-1">
            <span 
              className={`badge ${
                task.status === STATUSES.COMPLETE ? 'badge-success' : 
                task.status === STATUSES.ONGOING ? 'badge-info' : 
                task.status === STATUSES.REJECTED ? 'badge-error' : 
                task.status === STATUSES.DELETED ? 'badge-error' : 
                'badge-warn'
              }`}
              title={task.status === STATUSES.DELETED && task.deleteReason ? `Deleted: ${task.deleteReason}` : ''}
            >
              {task.status}
            </span>
            {isObserverOnly && (
              <span
                className="badge bg-blue-100 text-blue-800 border-blue-200 text-xs font-medium"
                title="Observer (view-only). Observers do not earn points and cannot change task status."
              >
                👁️ {t('observer') || 'Observer'}
              </span>
            )}
            {difficultyConfig && (
              <span 
                className="badge bg-gray-100 text-gray-800 border-gray-200 text-xs font-medium cursor-help"
                title={isObserverOnly
                  ? 'Observers do not earn points for this task.'
                  : `Base: ${difficultyConfig.points} pts${task.assignedUserIds?.length > 1 ? ` ÷ ${task.assignedUserIds.length} users = ${Math.round(difficultyConfig.points / task.assignedUserIds.length)} pts each` : ''}${task.isUrgent ? ' + 25% urgent bonus' : ''}${task.assignedUserIds?.length > 1 ? ' + 10% team bonus' : ''}${task.completedAt && task.targetDate && new Date(task.completedAt) <= new Date(task.targetDate) ? ' + 3 on-time bonus' : ''}`
                }
              >
                {actualUserPoints} pts
              </span>
            )}
            {task.isUrgent && (
              <span className="badge bg-red-100 text-red-800 border-red-200 text-xs font-medium">
                🚨 URGENT
              </span>
            )}
            {/* Show approval status badges */}
            {task.needsApproval && !task.approvedBy && !task.rejectedBy && (
              <span 
                className="text-xs text-amber-600 font-medium"
                title="This self-assigned task needs approval from a department head before it can be completed"
              >
                ⏳ Pending approval
              </span>
            )}
            {task.approvedBy && (
              <span 
                className="text-xs text-green-600"
                title={`Approved by ${task.approvedByName || 'Department Head'}`}
              >
                ✓
              </span>
            )}
            {task.rejectedBy && (
              <span 
                className="text-xs text-red-600 font-medium"
                title={`Rejected by ${task.rejectedByName || 'Department Head'}`}
              >
                ✗ Rejected
              </span>
            )}
            {hasBlockingRequests && (
              <span className="badge bg-red-100 text-red-800 border-2 border-red-300 font-semibold">
                🔒 BLOCKED
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {!isReadOnly && !isObserverOnly && (
            <>
              {task.status === STATUSES.PENDING && !hasBlockingRequests && task.status !== STATUSES.REJECTED && (
                <button onClick={onStart} className="btn btn-xs btn-primary">
                  {t('start')}
                </button>
              )}
              {task.status === STATUSES.ONGOING && !hasBlockingRequests && (
                <button 
                  onClick={onFinish} 
                  className={`btn btn-xs ${task.needsApproval && !task.approvedBy ? 'btn-disabled opacity-50 cursor-not-allowed' : 'btn-success'}`}
                  disabled={task.needsApproval && !task.approvedBy}
                  title={task.needsApproval && !task.approvedBy ? 'Task needs approval before completion' : ''}
                >
                  {t('finish')}
                </button>
              )}
              {task.status === STATUSES.COMPLETE && (
                <button onClick={onStart} className="btn btn-xs btn-secondary">
                  {t('reopen')}
                </button>
              )}
              {task.status === STATUSES.REJECTED && (
                <span className="text-xs text-red-600 font-medium px-2 py-1">
                  {t('rejected', 'Rejected')}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {expanded}
    </li>
  );
}



