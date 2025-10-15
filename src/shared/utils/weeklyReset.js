/**
 * Weekly Reset Utility Functions
 * 
 * Handles weekly reset of leaderboard scores (TCs/EP/LP) and related functionality.
 * This ensures fair competition by resetting rankings every week.
 */

import { db } from '../../firebase';
import { collection, doc, updateDoc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

/**
 * Check if it's time for a weekly reset
 * @param {Date} lastResetDate - The last reset date
 * @returns {boolean} True if weekly reset is needed
 */
export function shouldResetWeekly(lastResetDate) {
  if (!lastResetDate) return true;
  
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
  
  return lastResetDate < oneWeekAgo;
}

/**
 * Get the start of the current week (Monday)
 * @returns {Date} Start of current week
 */
export function getStartOfWeek() {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
}

/**
 * Get the end of the current week (Sunday)
 * @returns {Date} End of current week
 */
export function getEndOfWeek() {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return endOfWeek;
}

/**
 * Archive current week's leaderboard data
 * @param {Array} userRankings - Current user rankings
 * @param {Date} weekStart - Start of the week being archived
 * @param {Date} weekEnd - End of the week being archived
 * @returns {Promise<Object>} Archive data
 */
export async function archiveWeeklyLeaderboard(userRankings, weekStart, weekEnd) {
  const archiveData = {
    weekStart: weekStart,
    weekEnd: weekEnd,
    archivedAt: new Date(),
    rankings: userRankings.map(user => ({
      userId: user.id,
      userName: user.name,
      executionPoints: user.executionPoints,
      leadershipPoints: user.leadershipPoints,
      bonusPoints: user.bonusPoints,
      tcs: user.tcs,
      weekPoints: user.weekPoints,
      completedTasks: user.completedTasks,
      weeklyTasks: user.weeklyTasks,
      departmentId: user.departmentId,
      rank: userRankings.indexOf(user) + 1
    })),
    totalUsers: userRankings.length,
    topPerformer: userRankings[0] || null,
    topLeader: userRankings.find(u => u.leadershipPoints === Math.max(...userRankings.map(u => u.leadershipPoints))) || null
  };

  try {
    // Store archive in Firestore
    const archiveRef = doc(collection(db, 'weeklyLeaderboardArchives'));
    await updateDoc(archiveRef, archiveData);
    
    return { success: true, archiveId: archiveRef.id, data: archiveData };
  } catch (error) {
    console.error('Error archiving weekly leaderboard:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reset weekly scores for all users
 * @returns {Promise<Object>} Reset result
 */
export async function resetWeeklyScores() {
  try {
    const batch = writeBatch(db);
    
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const resetPromises = [];
    
    usersSnapshot.forEach(userDoc => {
      const userRef = doc(db, 'users', userDoc.id);
      
      // Reset weekly-specific fields
      const resetData = {
        weeklyExecutionPoints: 0,
        weeklyLeadershipPoints: 0,
        weeklyBonusPoints: 0,
        weeklyTCS: 0,
        weeklyCompletedTasks: 0,
        lastWeeklyReset: serverTimestamp(),
        weeklyRank: null,
        weeklyRankLastWeek: userDoc.data().weeklyRank || null // Store last week's rank
      };
      
      batch.update(userRef, resetData);
    });
    
    // Commit the batch update
    await batch.commit();
    
    // Update the global reset timestamp
    const resetTimestampRef = doc(db, 'system', 'weeklyReset');
    await updateDoc(resetTimestampRef, {
      lastReset: serverTimestamp(),
      resetCount: serverTimestamp() // This will be incremented by the cloud function
    });
    
    return { 
      success: true, 
      message: 'Weekly scores reset successfully',
      usersReset: usersSnapshot.size,
      resetTime: new Date()
    };
    
  } catch (error) {
    console.error('Error resetting weekly scores:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Get weekly leaderboard history
 * @param {number} limit - Number of weeks to retrieve (default: 4)
 * @returns {Promise<Array>} Array of weekly archives
 */
export async function getWeeklyLeaderboardHistory(limit = 4) {
  try {
    const archivesRef = collection(db, 'weeklyLeaderboardArchives');
    const q = query(archivesRef, where('archivedAt', '!=', null));
    const snapshot = await getDocs(q);
    
    const archives = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.archivedAt - a.archivedAt)
      .slice(0, limit);
    
    return { success: true, archives };
  } catch (error) {
    console.error('Error fetching weekly leaderboard history:', error);
    return { success: false, error: error.message, archives: [] };
  }
}


/**
 * Calculate weekly leadership points for a user
 * @param {Array} tasks - All tasks
 * @param {string} managerId - Manager's user ID
 * @param {Function} calculateTaskPoints - Function to calculate task points
 * @param {Date} startOfWeek - Start of current week
 * @param {Date} endOfWeek - End of current week
 * @returns {Object} Leadership points data
 */
function calculateWeeklyLeadershipPoints(tasks, managerId, calculateTaskPoints, startOfWeek, endOfWeek) {
  const managerTasks = tasks.filter(task => 
    task.assignedById === managerId && 
    task.status === 'Complete'
  );

  let totalLP = 0;
  let tasksAwarded = 0;

  managerTasks.forEach(task => {
    const completionDate = getTaskCompletionDate(task);
    if (completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek) {
      const taskPoints = calculateTaskPoints(task);
      const lpData = calculateLeadershipPoints(task, taskPoints);
      totalLP += lpData.total;
      tasksAwarded++;
    }
  });

  return {
    total: totalLP,
    tasksAwarded
  };
}

/**
 * Get task completion date
 * @param {Object} task - Task object
 * @returns {Date|null} Completion date
 */
function getTaskCompletionDate(task) {
  if (!task.completedAt) return null;
  
  if (task.completedAt.toDate) {
    return task.completedAt.toDate();
  } else if (task.completedAt instanceof Date) {
    return task.completedAt;
  } else if (typeof task.completedAt === 'string') {
    return new Date(task.completedAt);
  }
  
  return null;
}

/**
 * Get bonus points in a date range
 * @param {Object} bonusLedger - User's bonus ledger
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Total bonus points in range
 */
function getBonusPointsInRange(bonusLedger, startDate, endDate) {
  let total = 0;
  
  Object.values(bonusLedger).forEach(entry => {
    if (entry.date && entry.points) {
      const entryDate = entry.date.toDate ? entry.date.toDate() : new Date(entry.date);
      if (entryDate >= startDate && entryDate <= endDate) {
        total += entry.points;
      }
    }
  });
  
  return total;
}

/**
 * Calculate leadership points for a single task
 * @param {Object} task - Task object
 * @param {number} taskExecutionPoints - Execution points for the task
 * @returns {Object} Leadership points breakdown
 */
function calculateLeadershipPoints(task, taskExecutionPoints) {
  if (!task || !taskExecutionPoints) {
    return { completionBonus: 0, difficultyFairness: 0, onTimeBonus: 0, total: 0 };
  }

  let completionBonus = 0;
  let difficultyFairness = 0;
  let onTimeBonus = 0;

  const isRdNewSkill = task.isRdNewSkill || false;

  // Completion Bonus
  if (isRdNewSkill) {
    completionBonus = taskExecutionPoints;
  } else {
    completionBonus = Math.round(taskExecutionPoints * 0.10);
  }

  // Difficulty Fairness (only for regular tasks)
  if (!isRdNewSkill) {
    difficultyFairness = Math.round(taskExecutionPoints * 0.05);
  }

  // On-Time Delivery Bonus
  if (task.targetDate && task.completedAt) {
    const targetDate = task.targetDate.toDate ? task.targetDate.toDate() : new Date(task.targetDate);
    const completedDate = getTaskCompletionDate(task);
    
    if (completedDate && completedDate <= targetDate) {
      onTimeBonus = Math.round(taskExecutionPoints * 0.05);
    }
  }

  return {
    completionBonus,
    difficultyFairness,
    onTimeBonus,
    total: completionBonus + difficultyFairness + onTimeBonus
  };
}
