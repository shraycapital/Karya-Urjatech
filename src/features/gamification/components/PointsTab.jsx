import React, { useState, useMemo, useEffect } from 'react';
import { STATUSES, DIFFICULTY_CONFIG, ROLES } from '../../../shared/constants';
import Section from '../../../shared/components/Section';
import { getBonusClaimsInRange, getBonusPointsInRange, getPointsFromEntry, getTotalBonusPoints } from '../../../shared/utils/dailyBonus.js';


function PointsTab({ currentUser, tasks, users, departments, t, onGoToTasks }) {
  const [leaderboardView, setLeaderboardView] = useState('topPerformers'); // Default to top performers view
  const [calloutDismissedToday, setCalloutDismissedToday] = useState(false);

  // Calculate today's points and tasks
  const todayStats = useMemo(() => {
    if (!currentUser || !tasks) {
      return { points: 0, tasks: 0, bonusPoints: 0 };
    }
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const userCompletedTasks = tasks.filter(task => {
      if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
        return false;
      }
      
      return task.assignedUserIds && 
             Array.isArray(task.assignedUserIds) && 
             task.assignedUserIds.includes(currentUser.id) && 
             task.status === STATUSES.COMPLETE;
    });

    const todayTasks = userCompletedTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= todayStart && completionDate <= todayEnd;
    });

    const taskPoints = todayTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
    const currentUserBonusLedger = currentUser?.dailyBonusLedger || {};
    const bonusPoints = getBonusPointsInRange(currentUserBonusLedger, todayStart, todayEnd);

    return {
      points: taskPoints + bonusPoints,
      tasks: todayTasks.length,
      bonusPoints,
    };
  }, [currentUser, tasks]);

  const easyPendingCount = useMemo(() => {
    if (!Array.isArray(tasks) || !currentUser?.id) {
      return 0;
    }

    const easyKey = 'easy';
    const easyPoints = DIFFICULTY_CONFIG[easyKey]?.points || 0;

    return tasks.filter(task => {
      if (!task || !Array.isArray(task.assignedUserIds)) return false;
      if (!task.assignedUserIds.includes(currentUser.id)) return false;
      if (task.status === STATUSES.COMPLETE || task.status === STATUSES.DELETED) return false;

      const difficultyKey = typeof task.difficulty === 'string' ? task.difficulty.toLowerCase() : '';
      if (difficultyKey && DIFFICULTY_CONFIG[difficultyKey]) {
        return difficultyKey === easyKey;
      }

      if (typeof task.points === 'number' && easyPoints > 0) {
        return task.points <= easyPoints;
      }

      return false;
    }).length;
  }, [tasks, currentUser?.id]);

  const calloutStorageKey = useMemo(() => {
    if (!currentUser?.id) return null;
    return `pointsTab.calloutDismissed.${currentUser.id}`;
  }, [currentUser?.id]);

  // Helper functions
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

  const currentUserBonusLedger = currentUser?.dailyBonusLedger || {};
  const totalBonusPoints = getTotalBonusPoints(currentUserBonusLedger);

  const userTotalPoints = userCompletedTasks.reduce((total, task) => {
    return total + calculateTaskPoints(task);
  }, 0) + totalBonusPoints;

  const dailyPointsTarget = currentUser?.dailyPointsTarget || 350;

  // Calculate today's points and tasks (moved to top with other hooks)

  const pointsRemaining = Math.max(0, dailyPointsTarget - todayStats.points);

  useEffect(() => {
    if (!calloutStorageKey || typeof window === 'undefined') {
      setCalloutDismissedToday(false);
      return;
    }

    const stored = window.localStorage.getItem(calloutStorageKey);
    if (!stored) {
      setCalloutDismissedToday(false);
      return;
    }

    let storedDate = null;
    try {
      const parsed = JSON.parse(stored);
      storedDate = typeof parsed === 'object' ? parsed?.date : parsed;
    } catch (error) {
      storedDate = stored;
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    setCalloutDismissedToday(storedDate === todayKey);
  }, [calloutStorageKey]);

  const persistCalloutDismissal = () => {
    if (!calloutStorageKey || typeof window === 'undefined') return;
    const todayKey = new Date().toISOString().slice(0, 10);
    window.localStorage.setItem(calloutStorageKey, JSON.stringify({ date: todayKey, timestamp: Date.now() }));
  };

  const handleDismissCallout = () => {
    setCalloutDismissedToday(true);
    persistCalloutDismissal();
  };

  const handleGoToTasksClick = () => {
    persistCalloutDismissal();
    setCalloutDismissedToday(true);
    if (typeof onGoToTasks === 'function') {
      onGoToTasks();
    }
  };

  const isBehindTarget = todayStats.points < dailyPointsTarget;
  const showMomentumCallout = !calloutDismissedToday && dailyPointsTarget > 0 && (todayStats.tasks === 0 || isBehindTarget);

  const streakDays = currentUser?.streak || 0;

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

    const taskPoints = weeklyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
    const bonusPoints = getBonusPointsInRange(currentUserBonusLedger, startOfWeek, endOfWeek);

    return {
      points: taskPoints + bonusPoints,
      tasks: weeklyTasks.length,
      bonusPoints,
    };
  }, [userCompletedTasks, currentUserBonusLedger]);

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

    const taskPoints = monthlyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
    const bonusPoints = getBonusPointsInRange(currentUserBonusLedger, startOfMonth, endOfMonth);

    return {
      points: taskPoints + bonusPoints,
      tasks: monthlyTasks.length,
      bonusPoints,
    };
  }, [userCompletedTasks, currentUserBonusLedger]);

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
          points: tasksOfDifficulty.reduce((sum, task) => sum + calculateTaskPoints(task), 0),
        };
      }
    });

    const bonusClaims = getBonusClaimsInRange(currentUserBonusLedger, startOfWeek, endOfWeek);
    if (bonusClaims.length > 0) {
      const bonusPoints = bonusClaims.reduce((sum, claim) => sum + getPointsFromEntry(claim.entry), 0);
      breakdown.dailyBonus = {
        label: 'Daily Bonus',
        count: bonusClaims.length,
        points: bonusPoints,
        isBonus: true,
      };
    }

    return breakdown;
  }, [userCompletedTasks, currentUserBonusLedger]);

  // Calculate all users' rankings with robust date handling
  const userRankings = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    return users.map(user => {
      const userTasks = tasks.filter(task => {
        if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
          return false;
        }

        return task.assignedUserIds &&
               Array.isArray(task.assignedUserIds) &&
               task.assignedUserIds.includes(user.id) &&
               task.status === STATUSES.COMPLETE;
      });

      const userBonusLedger = user?.dailyBonusLedger || {};
      const totalTaskPoints = userTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
      const totalBonus = getTotalBonusPoints(userBonusLedger);

      const weeklyTasks = userTasks.filter(task => {
        const completionDate = getTaskCompletionDate(task);
        return completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek;
      });
      const weekTaskPoints = weeklyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
      const weekBonusPoints = getBonusPointsInRange(userBonusLedger, startOfWeek, endOfWeek);

      const monthlyTasksUser = userTasks.filter(task => {
        const completionDate = getTaskCompletionDate(task);
        return completionDate && completionDate >= startOfMonth && completionDate <= endOfMonth;
      });
      const monthTaskPoints = monthlyTasksUser.reduce((total, task) => total + calculateTaskPoints(task), 0);
      const monthBonusPoints = getBonusPointsInRange(userBonusLedger, startOfMonth, endOfMonth);

      return {
        id: user.id,
        name: user.name || 'Unknown',
        totalPoints: totalTaskPoints + totalBonus,
        weekPoints: weekTaskPoints + weekBonusPoints,
        monthPoints: monthTaskPoints + monthBonusPoints,
        completedTasks: userTasks.length,
        weeklyTasks: weeklyTasks.length,
        departmentId: user.departmentIds?.[0] || null,
      };
    }).sort((a, b) => b.weekPoints - a.weekPoints);
  }, [users, tasks]);

  // Get top 10 performers, include those with 0 points
  const topPerformers = userRankings.slice(0, 10);

  // Calculate user's rank
  const currentUserRank = userRankings.findIndex(user => user.id === currentUser.id) + 1;

  // Calculate department rankings (rebuild from tasks to ensure coverage across all depts)
  const departmentRankings = useMemo(() => {
    const deptStats = {};

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

    const completedTasksAllTime = tasks.filter(t => {
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

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const completedThisMonth = completedTasksAllTime.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      if (!completionDate) return false;
      return completionDate >= startOfMonth && completionDate <= endOfMonth;
    });

    completedThisMonth.forEach(task => {
      const dId = task.departmentId || 'unassigned';
      const dept = ensureDept(dId);
      dept.monthPoints += calculateTaskPoints(task);
    });

    users.forEach(user => {
      const deptId = user?.departmentIds?.[0] || 'unassigned';
      const dept = ensureDept(deptId);
      const userBonusLedger = user?.dailyBonusLedger || {};
      const totalBonus = getTotalBonusPoints(userBonusLedger);
      if (totalBonus > 0) {
        dept.totalPoints += totalBonus;
        const monthlyBonus = getBonusPointsInRange(userBonusLedger, startOfMonth, endOfMonth);
        dept.monthPoints += monthlyBonus;
        if (user?.id) {
          dept.userIds.add(user.id);
        }
      }
    });

    const finalized = Object.values(deptStats).map(d => ({
      ...d,
      totalUsers: d.userIds.size,
    })).sort((a, b) => {
      if (b.monthPoints !== a.monthPoints) return b.monthPoints - a.monthPoints;
      return b.totalPoints - a.totalPoints;
    });

    return finalized;
  }, [departments, tasks, users]);

  return (
    <div className="space-y-4 pb-20">
      <Section title={t('myPoints')}>
        {showMomentumCallout && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-amber-500">⚡</div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-900">Protect your streak</h4>
                <p className="mt-1 text-sm text-amber-900">
                  {streakDays > 0 ? `Your ${streakDays}-day streak is at risk—` : 'Lock in your streak—'}
                  {todayStats.tasks === 0
                    ? 'you have not completed a task yet today.'
                    : `you still need ${pointsRemaining} point${pointsRemaining === 1 ? '' : 's'} to hit today\'s target.`}
                  {' '}
                  {easyPendingCount > 0
                    ? `Try one of the ${easyPendingCount} easy task${easyPendingCount === 1 ? '' : 's'} waiting for a quick win.`
                    : 'Complete any task to stay on track.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {typeof onGoToTasks === 'function' && (
                    <button
                      type="button"
                      onClick={handleGoToTasksClick}
                      className="inline-flex items-center rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                    >
                      Review tasks
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDismissCallout}
                    className="inline-flex items-center rounded-md border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 transition hover:border-amber-300 hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Today progress toward daily target */}
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-600 mb-1">Today's progress</div>
              <div className="flex items-baseline gap-2 mb-2">
                <div className="text-3xl font-bold text-brand-600">{todayStats.points}</div>
                <div className="text-slate-500">/ {dailyPointsTarget} points</div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600" style={{ width: `${Math.min(100, dailyPointsTarget > 0 ? (todayStats.points / dailyPointsTarget) * 100 : 0)}%` }}></div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1">Current streak</div>
              <div className="text-2xl font-bold text-slate-800">{currentUser?.streak || 0} day{currentUser?.streak === 1 ? '' : 's'}</div>
              <div className="text-xs text-slate-500">with task completions</div>
            </div>
          </div>
          {todayStats.bonusPoints > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-600">
              <span>{t('dailyBonusApplied', 'Daily bonus applied!')}</span>
              <span className="text-emerald-700">+{todayStats.bonusPoints}</span>
            </div>
          )}

          <div className="mt-3 text-sm text-slate-700">
            {todayStats.points >= dailyPointsTarget && 'You have hit your daily target! Great job!'}
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
              Object.entries(weeklyBreakdown).map(([key, data]) => {
                const label = data.isBonus ? t('dailyBonus', 'Daily Bonus') : data.label;
                return (
                  <div key={key} className="flex justify-between">
                    <span>{label} ({data.count})</span>
                    <span className="font-medium">{data.points} pts</span>
                  </div>
                );
              })
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