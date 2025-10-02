import { db } from '../../firebase.js';
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  limit
} from 'firebase/firestore';
import { getCurrentLocation } from './location.js';

const DEFAULT_FETCH_LIMIT = 1000;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.toDate === 'function') {
    const parsed = value.toDate();
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value?.toMillis === 'function') {
    const parsed = new Date(value.toMillis());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value?.seconds !== undefined) {
    const parsed = new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toTimestampBounds = (startDate, endDate) => {
  const start = toDate(startDate) ?? new Date(0);
  const end = toDate(endDate) ?? new Date();
  const normalizedStart = start > end ? end : start;
  const normalizedEnd = end < start ? start : end;
  return {
    start,
    end,
    startMs: normalizedStart.getTime(),
    endMs: normalizedEnd.getTime(),
    startTimestamp: Timestamp.fromDate(normalizedStart),
    endTimestamp: Timestamp.fromDate(normalizedEnd)
  };
};

/**
 * Logs location data for a specific user action
 * @param {string} userId - User ID
 * @param {string} userName - User name
 * @param {string} action - Action performed (e.g., 'button_click', 'task_create', etc.)
 * @param {string} elementId - ID of the element clicked
 * @param {Object} details - Additional details about the action
 */
export const logLocationData = async (userId, userName, action, elementId, details = {}) => {
  try {
    if (!userId) {
      return false;
    }

    const finalUserName = userName || `User-${userId.substring(0, 8)}`;

    const location = await getCurrentLocation();

    if (!location) {
      return false;
    }

    const now = new Date();
    const locationTimestamp = location.timestamp ? new Date(location.timestamp) : now;
    const locationData = {
      userId,
      userName: finalUserName,
      action,
      elementId,
      details,
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: typeof location.accuracy === 'number' ? Math.round(location.accuracy) : null,
        timestamp: locationTimestamp.toISOString(),
      },
      timestamp: serverTimestamp(), // Firestore server timestamp
      createdAt: Timestamp.fromDate(now), // Firestore Timestamp for queries
      createdAtISO: now.toISOString(), // ISO string for debugging
    };

    await addDoc(collection(db, 'locationLogs'), locationData);
    return true;
  } catch (error) {
    console.error('Error logging location:', error);
    return false;
  }
};

export const parseLocationTimestamp = (record) => {
  return (
    toDate(record.createdAt) ||
    toDate(record.timestamp) ||
    toDate(record.createdAtISO) ||
    toDate(record.location?.timestamp) ||
    null
  );
};

export const normalizeLocationRecord = (record) => {
  const occurrence = parseLocationTimestamp(record);
  return {
    ...record,
    occurredAtMs: occurrence ? occurrence.getTime() : null,
    occurredAtISO: occurrence ? occurrence.toISOString() : null,
  };
};

/**
 * Gets location data for a specific user within a date range
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of location data
 */
export const getUserLocationData = async (userId, startDate, endDate) => {
  try {
    if (!userId) return [];

    const { startTimestamp, endTimestamp, startMs, endMs } = toTimestampBounds(startDate, endDate);

    const baseCollection = collection(db, 'locationLogs');
    let snapshot;

    try {
      const orderedQuery = query(
        baseCollection,
        where('userId', '==', userId),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp),
        orderBy('createdAt', 'desc'),
        limit(DEFAULT_FETCH_LIMIT)
      );
      snapshot = await getDocs(orderedQuery);
    } catch (error) {
      // Fallback for missing indexes
      const fallbackQuery = query(
        baseCollection,
        where('userId', '==', userId),
        limit(DEFAULT_FETCH_LIMIT)
      );
      snapshot = await getDocs(fallbackQuery);
    }

    const normalized = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .map((record) => normalizeLocationRecord(record))
      .filter((record) => {
        if (!record.occurredAtMs) return false;
        const withinRange = (!startMs || record.occurredAtMs >= startMs) && (!endMs || record.occurredAtMs <= endMs);
        return withinRange;
      })
      .sort((a, b) => (b.occurredAtMs || 0) - (a.occurredAtMs || 0));

    return normalized;
  } catch (error) {
    console.error('Error fetching user location data:', error);
    return [];
  }
};

/**
 * Gets all location data within a date range
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} Array of location data
 */
export const getAllLocationData = async (startDate, endDate) => {
  try {
    // Normalize and order date range
    let s = startDate instanceof Date ? startDate : new Date(startDate);
    let e = endDate instanceof Date ? endDate : new Date(endDate);
    if (Number.isNaN(s.getTime())) s = new Date(0);
    if (Number.isNaN(e.getTime())) e = new Date();
    if (s > e) { const t = s; s = e; e = t; }

    const startTimestamp = Timestamp.fromDate(s);
    const endTimestamp = Timestamp.fromDate(e);

    const q = query(
      collection(db, 'locationLogs'),
      where('createdAt', '>=', startTimestamp),
      where('createdAt', '<=', endTimestamp),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      .map(normalizeLocationRecord)
      .filter((record) => record.occurredAtMs);
  } catch (error) {
    console.error('Error fetching all location data:', error);
    return [];
  }
};

/**
 * Gets unique users who have location data
 * @returns {Promise<Array>} Array of unique users
 */
export const getUsersWithLocationData = async () => {
  try {
    const baseCollection = collection(db, 'locationLogs');
    let snapshot;

    try {
      const orderedQuery = query(baseCollection, orderBy('createdAt', 'desc'), limit(DEFAULT_FETCH_LIMIT));
      snapshot = await getDocs(orderedQuery);
    } catch (error) {
      const fallbackQuery = query(baseCollection, limit(DEFAULT_FETCH_LIMIT));
      snapshot = await getDocs(fallbackQuery);
    }

    const users = new Map();

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (!data?.userId) return;
      if (users.has(data.userId)) return;
      users.set(data.userId, {
        id: data.userId,
        name: data.userName || data.userId
      });
    });

    return Array.from(users.values());
  } catch (error) {
    console.error('Error fetching users with location data:', error);
    return [];
  }
};

/**
 * Test function to manually log a location entry
 * @param {string} userId - User ID
 * @param {string} userName - User name
 */
export const testLocationLogging = async (userId, userName) => {
  try {
    const location = await getCurrentLocation();
    if (!location) {
      return false;
    }
  } catch (error) {
    return false;
  }
  
  const success = await logLocationData(userId, userName, 'test_action', 'test_button', {
    test: true,
    timestamp: new Date().toISOString()
  });
  return success;
};

/**
 * Debug function to check what's in the database
 * @param {string} userId - User ID to check
 */
export const debugLocationData = async (userId) => {
  try {
    // Get all records for this user
    const allQuery = query(
      collection(db, 'locationLogs'),
      where('userId', '==', userId)
    );
    const allSnapshot = await getDocs(allQuery);
    return allSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error debugging location data:', error);
    return [];
  }
};


export const getUsersLocationStats = async (userIds, startDate, endDate) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  try {
    const { startMs, endMs, startTimestamp, endTimestamp } = toTimestampBounds(startDate, endDate);

    const stats = userIds.reduce((acc, userId) => {
      acc[userId] = { totalLocations: 0, activeDays: new Set(), lastLocation: null };
      return acc;
    }, {});

    const chunks = [];
    for (let i = 0; i < userIds.length; i += 10) {
      chunks.push(userIds.slice(i, i + 10));
    }

    for (const chunk of chunks) {
      const baseCollection = collection(db, 'locationLogs');
      const chunkQuery = query(
        baseCollection,
        where('userId', 'in', chunk),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      );

      const snapshot = await getDocs(chunkQuery);
      snapshot.docs.forEach((doc) => {
        const record = { id: doc.id, ...doc.data() };
        const normalized = normalizeLocationRecord(record);
        if (!normalized.occurredAtMs) return;
        const withinRange = (!startMs || normalized.occurredAtMs >= startMs) && (!endMs || normalized.occurredAtMs <= endMs);
        if (!withinRange) return;
        const target = stats[record.userId];
        if (!target) return;

        target.totalLocations += 1;
        const dayKey = normalized.occurredAtISO.split('T')[0];
        target.activeDays.add(dayKey);
        if (!target.lastLocation || normalized.occurredAtMs > new Date(target.lastLocation).getTime()) {
          target.lastLocation = normalized.occurredAtISO;
        }
      });
    }

    Object.keys(stats).forEach((userId) => {
      stats[userId].activeDays = stats[userId].activeDays.size;
    });

    return stats;
  } catch (error) {
    console.error('Error fetching users location stats:', error);
    return userIds.reduce((acc, userId) => {
      acc[userId] = { totalLocations: 0, activeDays: 0, lastLocation: null };
      return acc;
    }, {});
  }
};



