import React, { useState, useMemo } from 'react';
import { STATUSES, DIFFICULTY_CONFIG, ROLES } from '../../../shared/constants';
import Section from '../../../shared/components/Section';

function PointsTab({ currentUser, tasks, users, departments, t }) {
  const [leaderboardView, setLeaderboardView] = useState('topPerformers'); // Default to top performers view

  // Safety checks
  if (!currentUser || !tasks || !users) {
    return (
      <div className="space-y-4 pb-20">
        <Section title={t('points')}>
          <div className="text-center text-slate-500 py-8">
            {t('loading') || 'Loading...'}
          </div>
        </Section>
      </div>
    );
  }

  // Simplified date parsing for Firestore Timestamps
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
      
      console.warn('Unknown date format:', dateValue, typeof dateValue);
      return null;
    } catch (error) {
      console.error('Error parsing date:', dateValue, error);
      return null;
    }
  };

  // Get the completion date for a task (simplified since all are now timestamps)
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

  // Calculate points for a task
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

  // Calculate user's completed tasks and points (excluding deleted tasks for non-admins)
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

  const userTotalPoints = userCompletedTasks.reduce((total, task) => {
    return total + calculateTaskPoints(task);
  }, 0);

  // Calculate today's points and tasks
  const todayStats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= todayStart && completionDate <= todayEnd;
    });

    return {
      points: todayTasks.reduce((total, task) => total + calculateTaskPoints(task), 0),
      tasks: todayTasks.length
    };
  }, [userCompletedTasks]);

  // Calculate this week's points (Monday to Sunday)
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklyTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek;
    });

    return {
      points: weeklyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0),
      tasks: weeklyTasks.length
    };
  }, [userCompletedTasks]);

  // Calculate this month's points (1st to end of month)
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const monthlyTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= startOfMonth && completionDate <= endOfMonth;
    });

    return {
      points: monthlyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0),
      tasks: monthlyTasks.length
    };
  }, [userCompletedTasks]);

  // Calculate weekly breakdown by difficulty
  const weeklyBreakdown = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const thisWeekTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek;
    });

    const breakdown = {};
    Object.keys(DIFFICULTY_CONFIG).forEach(key => {
      const tasksOfDifficulty = thisWeekTasks.filter(task => task.difficulty === key);
      if (tasksOfDifficulty.length > 0) {
        breakdown[key] = {
          label: DIFFICULTY_CONFIG[key].label,
          count: tasksOfDifficulty.length,
          points: tasksOfDifficulty.reduce((sum, task) => sum + calculateTaskPoints(task), 0)
        };
      }
    });

    return breakdown;
  }, [userCompletedTasks]);

  // Calculate all users' rankings with robust date handling
  const userRankings = useMemo(() => {
    return users.map(user => {
      const userTasks = tasks.filter(task => {
        // Hide deleted tasks from regular users (only admins can see them)
        if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
          return false;
        }
        
        return task.assignedUserIds && 
               Array.isArray(task.assignedUserIds) && 
               task.assignedUserIds.includes(user.id) && 
               task.status === STATUSES.COMPLETE;
      });

      // Calculate total points
      const totalPoints = userTasks.reduce((total, task) => {
        return total + calculateTaskPoints(task);
      }, 0);

      // Calculate weekly points using robust date handling
      const weeklyTasks = userTasks.filter(task => {
        const completionDate = getTaskCompletionDate(task);
        if (!completionDate) {
          return false;
        }
        
        try {
          const now = new Date();
          
          // Get the start of the week (Monday at 00:00)
          const startOfWeek = new Date(now);
          const day = startOfWeek.getDay();
          const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
          startOfWeek.setDate(diff);
          startOfWeek.setHours(0, 0, 0, 0);
          
          // Get the end of the week (Sunday at 23:59:59)
          const endOfWeek = new Date(startOfWeek);
          endOfWeek.setDate(startOfWeek.getDate() + 6);
          endOfWeek.setHours(23, 59, 59, 999);
          
          const isInWeek = completionDate >= startOfWeek && completionDate <= endOfWeek;
          
          return isInWeek;
        } catch (error) {
          return false;
        }
      });

      const weekPoints = weeklyTasks.reduce((total, task) => {
        return total + calculateTaskPoints(task);
      }, 0);

      return {
        id: user.id,
        name: user.name || 'Unknown',
        totalPoints,
        weekPoints,
        completedTasks: userTasks.length,
        weeklyTasks: weeklyTasks.length,
        departmentId: user.departmentIds?.[0] || null
      };
    }).sort((a, b) => b.weekPoints - a.weekPoints); // Sort by weekly points
  }, [users, tasks]);

  // Get top 10 performers, include those with 0 points
  const topPerformers = userRankings.slice(0, 10);

  // Calculate user's rank
  const currentUserRank = userRankings.findIndex(user => user.id === currentUser.id) + 1;

  // Calculate department rankings (rebuild from tasks to ensure coverage across all depts)
  const departmentRankings = useMemo(() => {
    const deptStats = {};

    // Helper to ensure a department entry exists
    const ensureDept = (deptId) => {
      const dept = departments?.find(d => d.id === deptId);
      if (!deptStats[deptId]) {
        deptStats[deptId] = {
          id: deptId || 'unassigned',
          name: dept?.name || (deptId ? String(deptId) : 'Unassigned'),
          totalPoints: 0,
          monthPoints: 0,
          totalUsers: 0,
          totalTasks: 0,
          userIds: new Set(),
        };
      }
      return deptStats[deptId];
    };

    // Consider ALL completed tasks (for total points) - excluding deleted tasks for non-admins
    const completedTasksAllTime = tasks.filter(t => {
      // Hide deleted tasks from regular users (only admins can see them)
      if (t.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
        return false;
      }
      return t.status === STATUSES.COMPLETE;
    });
    completedTasksAllTime.forEach(task => {
      const dId = task.departmentId || 'unassigned';
      const dept = ensureDept(dId);
      dept.totalPoints += calculateTaskPoints(task);
      dept.totalTasks += 1;
      if (Array.isArray(task.assignedUserIds)) {
        task.assignedUserIds.forEach(uid => dept.userIds.add(uid));
      }
    });

    // Consider only current month for monthPoints using robust date handling
    const completedThisMonth = completedTasksAllTime.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      if (!completionDate) return false;
      
      try {
        const now = new Date();
        return completionDate.getMonth() === now.getMonth() && completionDate.getFullYear() === now.getFullYear();
      } catch (error) {
        return false;
      }
    });

    completedThisMonth.forEach(task => {
      const dId = task.departmentId || 'unassigned';
      const dept = ensureDept(dId);
      dept.monthPoints += calculateTaskPoints(task);
    });

    // Finalize totals and sort by monthPoints (desc), fallback to totalPoints
    const finalized = Object.values(deptStats).map(d => ({
      ...d,
      totalUsers: d.userIds.size,
    })).sort((a, b) => {
      if (b.monthPoints !== a.monthPoints) return b.monthPoints - a.monthPoints;
      return b.totalPoints - a.totalPoints;
    });

    return finalized;
  }, [departments, tasks]);

  return (
    <div className="space-y-4 pb-20">
      <Section title={t('myPoints')}>
        {/* Today progress toward daily target */}
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-600 mb-1">Today's progress</div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="text-3xl font-bold text-brand-600">{todayStats.points}</div>
                <div className="text-slate-500">/ {currentUser?.dailyPointsTarget || 350} points</div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, (todayStats.points / (currentUser?.dailyPointsTarget || 350)) * 100)}%` }}></div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1">Current streak</div>
              <div className="text-2xl font-bold text-slate-800">{currentUser?.streak || 0} day{currentUser?.streak === 1 ? '' : 's'}</div>
              <div className="text-xs text-slate-500">with task completions</div>
            </div>
          </div>
          <div className="mt-3 text-sm text-slate-700">
            {todayStats.points >= (currentUser?.dailyPointsTarget || 350) && 'You have hit your daily target! Great job!'}
          </div>
        </div>

        {/* Quick summary cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{todayStats.tasks}</div>
            <div className="text-xs text-slate-600">Tasks completed today</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{userTotalPoints}</div>
            <div className="text-xs text-slate-600">Total points</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{weeklyStats.points}</div>
            <div className="text-xs text-slate-600">Points this week</div>
          </div>
          <div className="text-center p-3 bg-slate-50 rounded-lg">
            <div className="text-xl font-bold text-slate-700">{monthlyStats.points}</div>
            <div className="text-xs text-slate-600">Points this month</div>
          </div>
        </div>

        {/* Weekly difficulty breakdown */}
        <div className="bg-slate-50 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-slate-700 mb-3">Points breakdown this week</h4>
          <div className="space-y-2 text-sm">
            {Object.keys(weeklyBreakdown).length === 0 ? (
              <div className="text-center text-slate-500 py-2">
                No tasks completed this week
              </div>
            ) : (
              Object.entries(weeklyBreakdown).map(([key, data]) => (
                <div key={key} className="flex justify-between">
                  <span>{data.label} ({data.count})</span>
                  <span className="font-medium">{data.points} pts</span>
                </div>
              ))
            )}
          </div>
        </div>
      </Section>

      <Section title={t('leaderboard')}>
        <div className="text-center text-lg mb-4">
          {t('yourRank')}: <span className="font-bold text-brand-600">#{currentUserRank}</span>
        </div>
        <div className="text-center text-sm text-slate-500 mb-6">
          {currentUserRank === 1 ? '🏆 You are the leader!' : 'Keep going! You are doing great!'}
        </div>
        
        {/* View Switcher */}
        <div className="flex justify-center mb-6">
          <div className="bg-slate-100 rounded-lg p-1 flex">
            <button
              onClick={() => setLeaderboardView('topPerformers')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                leaderboardView === 'topPerformers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏆 {t('topPerformers')}
            </button>
            <button
              onClick={() => setLeaderboardView('departments')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                leaderboardView === 'departments'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏢 {t('departments')}
            </button>
          </div>
        </div>
        
        {/* Top Performers View */}
        {leaderboardView === 'topPerformers' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-700">Top Performers</h4>
              <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                🔄 Resets every Monday
              </div>
            </div>
            <div className="space-y-2">
              {topPerformers.length > 0 ? (
                topPerformers.map((user, index) => (
                  <div key={user.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                    user.id === currentUser.id 
                      ? 'bg-brand-50 border-brand-200' 
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-yellow-500 text-white' :
                        index === 1 ? 'bg-gray-400 text-white' :
                        index === 2 ? 'bg-amber-600 text-white' :
                        'bg-slate-300 text-slate-700'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className={`font-medium ${
                          user.id === currentUser.id ? 'text-brand-700' : 'text-slate-700'
                        }`}>
                          {user.id === currentUser.id ? '👤 ' : ''}{user.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {user.weeklyTasks} tasks this week • {user.completedTasks} total tasks
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-700">{user.weekPoints}</div>
                      <div className="text-xs text-slate-500">week points</div>
                      <div className="text-xs text-slate-400">({user.totalPoints} total)</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <div className="text-lg mb-2">📊</div>
                  <div className="text-sm">No weekly points yet</div>
                  <div className="text-xs mt-1">Complete tasks this week to appear on the leaderboard</div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Department Performance View */}
        {leaderboardView === 'departments' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-700">Department Performance</h4>
              <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                🔄 Resets every month
              </div>
            </div>
            <div className="space-y-2">
              {departmentRankings.length > 0 && departmentRankings.some(dept => dept.monthPoints > 0) ? (
                departmentRankings.filter(dept => dept.monthPoints > 0).map((dept, index) => (
                  <div key={dept.id} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50 border-slate-200">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        index === 0 ? 'bg-yellow-500 text-white' :
                        index === 1 ? 'bg-gray-400 text-white' :
                        index === 2 ? 'bg-amber-600 text-white' :
                        'bg-slate-300 text-slate-700'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <div className="font-medium text-slate-700">{dept.name}</div>
                        <div className="text-xs text-slate-500">
                          {dept.totalUsers} users • {dept.totalTasks} tasks
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-700">{dept.monthPoints}</div>
                      <div className="text-xs text-slate-500">month points</div>
                      <div className="text-xs text-slate-400">({dept.totalPoints} total)</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <div className="text-lg mb-2">🏢</div>
                  <div className="text-sm">No monthly department points yet</div>
                  <div className="text-xs mt-1">Complete tasks this month to see department rankings</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Removed bottom Stats section for a cleaner Points tab */}
    </div>
  );
}

export default PointsTab;