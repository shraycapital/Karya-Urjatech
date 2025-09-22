import React, { useState, useMemo } from 'react';
import { STATUSES, DIFFICULTY_CONFIG, ROLES } from '../../../shared/constants';

export default function DailyPointsTarget({ 
  currentUser, 
  tasks = [], 
  t, 
  onUpdateTarget 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempTarget, setTempTarget] = useState('');

  // Get user's daily target (default 350) - REVERTED
  const dailyTarget = currentUser?.dailyPointsTarget || 350;

  // Robust date parsing (Firestore Timestamp, Date, seconds/nanos)
  const parseDate = (value) => {
    if (!value) return null;
    try {
      if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function') return value.toDate();
        if (typeof value.toMillis === 'function') return new Date(value.toMillis());
        if (value.seconds !== undefined) return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6);
      }
      if (value instanceof Date) return value;
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const getTaskCompletionDate = (task) => {
    return (
      parseDate(task?.completedAt) ||
      parseDate(task?.updatedAt) ||
      parseDate(task?.createdAt) ||
      parseDate(task?.timestamp)
    );
  };

  const calculateTaskPoints = (task) => {
    const assignedUserCount = Array.isArray(task?.assignedUserIds)
      ? task.assignedUserIds.length
      : task?.assignedUserId
        ? 1
        : 0;
    if (assignedUserCount <= 0) return 0;

    let basePoints = 50;
    if (task?.difficulty && DIFFICULTY_CONFIG[task.difficulty]) {
      basePoints = DIFFICULTY_CONFIG[task.difficulty].points;
    } else if (typeof task?.points === 'number') {
      basePoints = task.points;
    }

    const basePerUser = Math.round(basePoints / assignedUserCount);
    const collaborationBonus = assignedUserCount > 1 ? Math.round(basePerUser * 0.1) : 0;
    const urgentBonus = task?.isUrgent ? Math.round(basePerUser * 0.25) : 0;
    return basePerUser + collaborationBonus + urgentBonus;
  };

  // Calculate points earned today
  const pointsEarnedToday = useMemo(() => {
    if (!currentUser?.id) return 0;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    console.log('Daily Points Debug:', {
      todayStart: todayStart.toISOString(),
      todayEnd: todayEnd.toISOString(),
      totalTasks: tasks.length,
      currentUserId: currentUser.id
    });

    const todaysCompletedTasks = tasks.filter((task) => {
      if (!task || task.status !== STATUSES.COMPLETE) return false;

      // Hide deleted tasks from regular users (only admins can see them)
      if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
        return false;
      }

      const isAssigned = Array.isArray(task.assignedUserIds)
        ? task.assignedUserIds.includes(currentUser.id)
        : task.assignedUserId === currentUser.id;
      if (!isAssigned) return false;

      const completedDate = getTaskCompletionDate(task);
      if (!completedDate) return false;
      
      const isToday = completedDate >= todayStart && completedDate < todayEnd;
      
      if (isToday) {
        console.log('Found task completed today:', {
          title: task.title,
          completedDate: completedDate.toISOString(),
          points: calculateTaskPoints(task),
          difficulty: task.difficulty,
          isUrgent: task.isUrgent
        });
      }
      
      return isToday;
    });

    const totalPoints = todaysCompletedTasks.reduce((sum, task) => sum + calculateTaskPoints(task), 0);
    
    console.log('Daily points calculation:', {
      tasksCompletedToday: todaysCompletedTasks.length,
      totalPointsToday: totalPoints
    });

    return totalPoints;
  }, [tasks, currentUser?.id]);

  // Calculate progress percentage
  const progressPercentage = Math.min((pointsEarnedToday / dailyTarget) * 100, 100);

  // Get progress color based on percentage
  const getProgressColor = () => {
    if (progressPercentage >= 100) return 'bg-green-500';
    if (progressPercentage >= 75) return 'bg-blue-500';
    if (progressPercentage >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleEditClick = () => {
    setTempTarget(dailyTarget.toString());
    setIsEditing(true);
  };

  const handleSave = () => {
    const newTarget = parseInt(tempTarget, 10);
    if (!isNaN(newTarget) && newTarget >= 1 && newTarget <= 10000) {
      onUpdateTarget(newTarget);
      setIsEditing(false);
    } else {
      alert('Please enter a valid number between 1 and 10000.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setTempTarget('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 mb-3">
      <div className="flex items-center justify-between">
        {/* Left: Title and Points */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">
            {t('dailyPts') || 'Daily Pts'}
          </span>
          <span className="text-sm font-bold text-gray-900">
            {pointsEarnedToday}/{dailyTarget}
          </span>
        </div>

        {/* Right: Progress Bar and Edit */}
        <div className="flex items-center gap-2">
          {/* Progress Bar - More Space */}
          <div className="w-24 bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${getProgressColor()}`}
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>

          {/* Edit Button */}
          {!isEditing ? (
            <button
              onClick={handleEditClick}
              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded transition-colors"
              title="Edit daily target"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={tempTarget}
                onChange={(e) => setTempTarget(e.target.value)}
                onKeyDown={handleKeyPress}
                className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="350"
                min="1"
                max="10000"
                autoFocus
              />
              <button
                onClick={handleSave}
                className="p-0.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                title="Save target"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button
                onClick={handleCancel}
                className="p-0.5 text-gray-400 hover:bg-gray-200 rounded transition-colors"
                title="Cancel"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Achievement Badge - Minimal */}
      {pointsEarnedToday >= dailyTarget && (
        <div className="mt-1 text-center">
          <span className="text-xs text-green-600 font-medium">
            🏆 {pointsEarnedToday > dailyTarget ? `+${pointsEarnedToday - dailyTarget} bonus` : 'Target achieved!'}
          </span>
        </div>
      )}
    </div>
  );
}
