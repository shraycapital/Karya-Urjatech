/**
 * Points Management Utility
 * 
 * Handles points with expiration, usable points calculation, and redemption.
 * Points can expire after a configurable number of days.
 */

import { db } from '../../firebase';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { cleanFirestoreData } from './firestoreHelpers';

/**
 * Configuration for points system
 */
export const POINTS_CONFIG = {
  EXPIRATION_DAYS: 90, // Points expire after 90 days by default
  MIN_REDEMPTION_POINTS: 100, // Minimum points required for redemption
};

/**
 * Calculate usable points for a user
 * Usable points are points that haven't expired yet
 * 
 * @param {Object} user - User document
 * @returns {number} Total usable points
 */
export function calculateUsablePoints(user) {
  if (!user) {
    return 0;
  }

  // If no pointsHistory exists yet, use the calculated total TCS as usable points
  // This allows existing users to have points for marketplace
  if (!user.pointsHistory) {
    // Return 0 until they make their first purchase or we backfill their points
    // For now, we'll consider all their TCS as usable
    return user.totalTCS || user.weeklyTCS || 0;
  }

  const now = new Date();
  let usablePoints = 0;

  // Iterate through points history
  Object.entries(user.pointsHistory || {}).forEach(([dateKey, entry]) => {
    if (!entry || typeof entry.points !== 'number') {
      return;
    }

    const pointsDate = parseDateKey(dateKey);
    if (!pointsDate) {
      return;
    }

    // Calculate expiration date
    const expirationDate = new Date(pointsDate);
    expirationDate.setDate(expirationDate.getDate() + (entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS));

    // Check if points are still valid
    if (now <= expirationDate && entry.isUsable !== false) {
      usablePoints += entry.points;
    }
  });

  return Math.floor(usablePoints);
}

/**
 * Calculate total points (including expired)
 * 
 * @param {Object} user - User document
 * @returns {number} Total points
 */
export function calculateTotalPoints(user) {
  if (!user) {
    return 0;
  }

  // If no pointsHistory exists yet, use the calculated total TCS
  if (!user.pointsHistory) {
    return user.totalTCS || user.weeklyTCS || 0;
  }

  let totalPoints = 0;
  Object.values(user.pointsHistory || {}).forEach((entry) => {
    if (entry && typeof entry.points === 'number') {
      totalPoints += entry.points;
    }
  });

  return Math.floor(totalPoints);
}

/**
 * Calculate expired points
 * 
 * @param {Object} user - User document
 * @returns {number} Expired points
 */
export function calculateExpiredPoints(user) {
  const totalPoints = calculateTotalPoints(user);
  const usablePoints = calculateUsablePoints(user);
  return totalPoints - usablePoints;
}

/**
 * Get points breakdown with expiration info
 * 
 * @param {Object} user - User document
 * @returns {Object} Points breakdown
 */
export function getPointsBreakdown(user) {
  if (!user) {
    return {
      usable: 0,
      expired: 0,
      total: 0,
      expiringSoon: [],
    };
  }

  // If no pointsHistory exists yet, use the calculated total TCS
  if (!user.pointsHistory) {
    const usablePoints = user.totalTCS || user.weeklyTCS || 0;
    return {
      usable: usablePoints,
      expired: 0,
      total: usablePoints,
      expiringSoon: [],
    };
  }

  const now = new Date();
  const expiringSoon = [];
  let usablePoints = 0;
  let expiredPoints = 0;

  Object.entries(user.pointsHistory || {}).forEach(([dateKey, entry]) => {
    if (!entry || typeof entry.points !== 'number') {
      return;
    }

    const pointsDate = parseDateKey(dateKey);
    if (!pointsDate) {
      return;
    }

    const expirationDate = new Date(pointsDate);
    const expirationDays = entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS;
    expirationDate.setDate(expirationDate.getDate() + expirationDays);

    // Check expiration status
    const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));

    if (now > expirationDate || entry.isUsable === false) {
      expiredPoints += entry.points;
    } else {
      usablePoints += entry.points;
      
      // Track points expiring within 7 days
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        expiringSoon.push({
          dateKey,
          points: entry.points,
          expirationDate,
          daysUntilExpiry,
        });
      }
    }
  });

  return {
    usable: Math.floor(usablePoints),
    expired: Math.floor(expiredPoints),
    total: Math.floor(usablePoints + expiredPoints),
    expiringSoon: expiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
  };
}

/**
 * Parse date key to Date object
 * @param {string} dateKey - Date key in format YYYY-MM-DD
 * @returns {Date|null} Date object or null
 */
function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') {
    return null;
  }

  const parts = dateKey.split('-').map((segment) => Number.parseInt(segment, 10));
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }

  const [year, month, day] = parts;
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Format date to date key
 * @param {Date} date - Date object
 * @returns {string} Date key
 */
function formatDateKey(date) {
  if (!(date instanceof Date)) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Add points to user (when they complete tasks)
 * 
 * @param {string} userId - User ID
 * @param {number} points - Points to add
 * @param {number} expirationDays - Days until expiration (optional, defaults to POINTS_CONFIG.EXPIRATION_DAYS)
 * @returns {Promise<Object>} Result
 */
export async function addPoints(userId, points, expirationDays = null) {
  try {
    if (!userId || typeof points !== 'number' || points <= 0) {
      throw new Error('Invalid parameters');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const todayKey = formatDateKey(new Date());
    
    if (!todayKey) {
      throw new Error('Unable to generate date key');
    }

    // Get existing points history
    const pointsHistory = userData.pointsHistory || {};
    
    // Add new points entry
    const newEntry = {
      points: points,
      addedAt: serverTimestamp(),
      expirationDays: expirationDays || POINTS_CONFIG.EXPIRATION_DAYS,
      isUsable: true,
    };

    // If entry exists for today, add to it
    if (pointsHistory[todayKey]) {
      pointsHistory[todayKey].points += points;
    } else {
      pointsHistory[todayKey] = newEntry;
    }

    // Calculate new usable points
    const updatedUsablePoints = calculateUsablePoints({ ...userData, pointsHistory });
    const updatedTotalPoints = calculateTotalPoints({ ...userData, pointsHistory });

    // Update user document
    const updateData = {
      pointsHistory: pointsHistory,
      usablePoints: updatedUsablePoints,
      totalPoints: updatedTotalPoints,
      updatedAt: serverTimestamp(),
    };

    const cleanUpdateData = cleanFirestoreData(updateData);
    await updateDoc(userRef, cleanUpdateData);

    return {
      success: true,
      newUsablePoints: updatedUsablePoints,
      newTotalPoints: updatedTotalPoints,
    };

  } catch (error) {
    console.error('Error adding points:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Redeem points (deduct from usable points)
 * 
 * @param {string} userId - User ID
 * @param {number} pointsToRedeem - Points to redeem
 * @returns {Promise<Object>} Result
 */
export async function redeemPoints(userId, pointsToRedeem) {
  try {
    if (!userId || typeof pointsToRedeem !== 'number' || pointsToRedeem <= 0) {
      throw new Error('Invalid parameters');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const usablePoints = userData.usablePoints || 0;

    // Check if user has enough points
    if (usablePoints < pointsToRedeem) {
      return {
        success: false,
        error: 'Insufficient points',
        available: usablePoints,
      };
    }

    // Get points history and deduct points
    const pointsHistory = { ...(userData.pointsHistory || {}) };
    
    // Deduct points from oldest non-expired entries first
    let remainingToRedeem = pointsToRedeem;
    const sortedEntries = Object.entries(pointsHistory).sort((a, b) => {
      return parseDateKey(a[0]) - parseDateKey(b[0]);
    });

    for (const [dateKey, entry] of sortedEntries) {
      if (remainingToRedeem <= 0) break;

      if (entry && entry.points > 0 && entry.isUsable !== false) {
        // Check if entry is still valid
        const pointsDate = parseDateKey(dateKey);
        if (!pointsDate) continue;

        const expirationDate = new Date(pointsDate);
        expirationDate.setDate(expirationDate.getDate() + (entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS));

        const now = new Date();
        if (now <= expirationDate) {
          const pointsToDeduct = Math.min(remainingToRedeem, entry.points);
          entry.points -= pointsToDeduct;
          remainingToRedeem -= pointsToDeduct;

          // If all points are used, mark as unusable
          if (entry.points <= 0) {
            entry.isUsable = false;
          }
        }
      }
    }

    if (remainingToRedeem > 0) {
      throw new Error('Not enough usable points available');
    }

    // Calculate new usable points
    const updatedUsablePoints = calculateUsablePoints({ ...userData, pointsHistory });
    const updatedTotalPoints = calculateTotalPoints({ ...userData, pointsHistory });

    // Update user document
    const updateData = {
      pointsHistory: pointsHistory,
      usablePoints: updatedUsablePoints,
      totalPoints: updatedTotalPoints,
      totalRedeemed: (userData.totalRedeemed || 0) + pointsToRedeem,
      lastRedemption: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const cleanUpdateData = cleanFirestoreData(updateData);
    await updateDoc(userRef, cleanUpdateData);

    return {
      success: true,
      newUsablePoints: updatedUsablePoints,
      newTotalPoints: updatedTotalPoints,
      redeemed: pointsToRedeem,
    };

  } catch (error) {
    console.error('Error redeeming points:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Mark all points as expired for a user (admin function)
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result
 */
export async function expireAllUserPoints(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const pointsHistory = { ...(userData.pointsHistory || {}) };

    // Mark all entries as unusable
    Object.keys(pointsHistory).forEach(key => {
      if (pointsHistory[key]) {
        pointsHistory[key].isUsable = false;
      }
    });

    const updateData = {
      pointsHistory: pointsHistory,
      usablePoints: 0,
      totalPoints: userData.totalPoints || 0,
      allPointsExpired: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const cleanUpdateData = cleanFirestoreData(updateData);
    await updateDoc(userRef, cleanUpdateData);

    return {
      success: true,
      message: 'All points marked as expired',
    };

  } catch (error) {
    console.error('Error expiring user points:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Reset expiration date for a user's oldest points (admin function)
 * Resets the expiration date to today, effectively making them expire in [EXPIRATION_DAYS] days from now
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result
 */
export async function resetPointsExpirationDate(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    const pointsHistory = { ...(userData.pointsHistory || {}) };

    // Find oldest entry
    const entries = Object.entries(pointsHistory).sort((a, b) => {
      return parseDateKey(a[0]) - parseDateKey(b[0]);
    });

    if (entries.length === 0) {
      return {
        success: false,
        message: 'No points history found',
      };
    }

    const [oldestDateKey, oldestEntry] = entries[0];
    
    if (!oldestEntry) {
      return {
        success: false,
        message: 'Invalid points entry',
      };
    }

    // Reset the addedAt timestamp to now, making it expire in EXPIRATION_DAYS days
    const todayKey = formatDateKey(new Date());
    
    // If oldest entry exists and has points, update its timestamp
    if (oldestEntry.points > 0) {
      oldestEntry.addedAt = serverTimestamp();
      pointsHistory[oldestDateKey] = oldestEntry;
    } else {
      // If oldest entry has no points, mark all as expired
      Object.keys(pointsHistory).forEach(key => {
        if (pointsHistory[key]) {
          pointsHistory[key].isUsable = false;
        }
      });
    }

    // Calculate new usable points
    const updatedUsablePoints = calculateUsablePoints({ ...userData, pointsHistory });
    const updatedTotalPoints = calculateTotalPoints({ ...userData, pointsHistory });

    const updateData = {
      pointsHistory: pointsHistory,
      usablePoints: updatedUsablePoints,
      totalPoints: updatedTotalPoints,
      expirationResetAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const cleanUpdateData = cleanFirestoreData(updateData);
    await updateDoc(userRef, cleanUpdateData);

    return {
      success: true,
      message: 'Points expiration date reset',
      newUsablePoints: updatedUsablePoints,
    };

  } catch (error) {
    console.error('Error resetting points expiration:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Clean expired points from database (should be run periodically)
 * 
 * @returns {Promise<Object>} Result
 */
export async function cleanExpiredPoints() {
  try {
    const { collection, getDocs, query, writeBatch } = await import('firebase/firestore');
    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(query(usersRef));

    const batch = writeBatch(db);
    let updated = 0;
    const now = new Date();

    snapshot.forEach(doc => {
      const userData = doc.data();
      const pointsHistory = { ...(userData.pointsHistory || {}) };
      let hasChanges = false;

      Object.entries(pointsHistory).forEach(([dateKey, entry]) => {
        if (!entry || typeof entry.points !== 'number') return;

        const pointsDate = parseDateKey(dateKey);
        if (!pointsDate) return;

        const expirationDate = new Date(pointsDate);
        expirationDate.setDate(expirationDate.getDate() + (entry.expirationDays || POINTS_CONFIG.EXPIRATION_DAYS));

        // Mark as unusable if expired
        if (now > expirationDate && entry.isUsable !== false) {
          entry.isUsable = false;
          hasChanges = true;
        }
      });

      if (hasChanges) {
        const updatedUsablePoints = calculateUsablePoints({ ...userData, pointsHistory });
        const cleanPointsHistory = cleanFirestoreData(pointsHistory);
        
        batch.update(doc.ref, {
          pointsHistory: cleanPointsHistory,
          usablePoints: updatedUsablePoints,
          updatedAt: serverTimestamp(),
        });
        updated++;
      }
    });

    await batch.commit();

    return {
      success: true,
      usersUpdated: updated,
    };

  } catch (error) {
    console.error('Error cleaning expired points:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

