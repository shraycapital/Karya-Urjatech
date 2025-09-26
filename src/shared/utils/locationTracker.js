import { db } from '../../firebase.js';
import { collection, addDoc, query, where, orderBy, getDocs, serverTimestamp, Timestamp, limit } from 'firebase/firestore';
import { getCurrentLocation } from './location.js';

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
      console.warn('dYs? Cannot log location without a userId', { action, elementId });
      return false;
    }

    const finalUserName = userName || `User-${userId.substring(0, 8)}`;
    console.log('dY-??,? Attempting to log location for:', { userId, userName: finalUserName, action, elementId });

    const location = await getCurrentLocation();

    if (!location) {
      console.warn('dYs? Location not available for logging - permission denied or not supported');
      return false;
    }

    console.log('dY"? Location obtained:', location);

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

    const docRef = await addDoc(collection(db, 'locationLogs'), locationData);
    console.log('?o. Location logged successfully:', {
      docId: docRef.id,
      action,
      elementId,
      location,
      userId,
    });
    return true;
  } catch (error) {
    console.error('??O Error logging location:', error);
    return false;
  }
};

export const parseLocationTimestamp = (record) => {
  const parseDate = (value, fieldName) => {
    if (!value) {
      console.log(`parseDate: No value for ${fieldName}`);
      return null;
    }
    try {
      // Explicit ISO string handling
      if (typeof value === 'string') {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          console.log(`parseDate: Successfully parsed string for ${fieldName}: ${d.toISOString()}`);
          return d;
        } else {
          console.log(`parseDate: Invalid date string for ${fieldName}: ${value}`);
          return null;
        }
      }
      
      // Firestore Timestamp handling
      if (value && typeof value === 'object') {
        if (typeof value.toDate === 'function') {
          const d = value.toDate();
          console.log(`parseDate: Parsed using toDate for ${fieldName}: ${d.toISOString()}`);
          return d;
        }
        if (typeof value.toMillis === 'function') {
          const d = new Date(value.toMillis());
          console.log(`parseDate: Parsed using toMillis for ${fieldName}: ${d.toISOString()}`);
          return d;
        }
        if (value.seconds !== undefined) {
          const d = new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1e6);
          console.log(`parseDate: Parsed using seconds/nanoseconds for ${fieldName}: ${d.toISOString()}`);
          return d;
        }
      }
      
      if (value instanceof Date) {
        console.log(`parseDate: Direct Date object for ${fieldName}: ${value.toISOString()}`);
        return value;
      }
      
      // Fallback
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        console.log(`parseDate: Fallback parse successful for ${fieldName}: ${d.toISOString()}`);
        return d;
      } else {
        console.log(`parseDate: Fallback parse failed for ${fieldName}`);
        return null;
      }
    } catch (err) {
      console.log(`parseDate: Error parsing ${fieldName}: ${err.message}`);
      return null;
    }
  };

  console.log('Starting parseLocationTimestamp for record:', record?.id);

  return (
    parseDate(record.createdAt, 'createdAt') ||
    parseDate(record.timestamp, 'timestamp') ||
    parseDate(record.createdAtISO, 'createdAtISO') ||
    parseDate(record.location?.timestamp, 'location.timestamp') ||
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
    // Ensure valid, ordered date range
    const ensureDate = (v) => (v instanceof Date ? v : new Date(v));
    let normalizedStart = ensureDate(startDate);
    let normalizedEnd = ensureDate(endDate);
    if (Number.isNaN(normalizedStart.getTime())) normalizedStart = new Date(0);
    if (Number.isNaN(normalizedEnd.getTime())) normalizedEnd = new Date();
    if (normalizedStart > normalizedEnd) {
      const tmp = normalizedStart; normalizedStart = normalizedEnd; normalizedEnd = tmp;
    }

    console.log('dY"? Fetching location data for:', {
      userId,
      startDate: normalizedStart.toISOString(),
      endDate: normalizedEnd.toISOString()
    });

    console.log('dY"? Step 1: Checking all records for user...');
    const allUserQuery = query(
      collection(db, 'locationLogs'),
      where('userId', '==', userId)
    );
    const allUserSnapshot = await getDocs(allUserQuery);
    const allUserRecords = allUserSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`dY"S Found ${allUserRecords.length} total records for user ${userId}`);
    if (allUserRecords.length > 0) {
      console.log('dY", Sample record structure:', allUserRecords[0]);
    }

    const startTimestamp = Timestamp.fromDate(normalizedStart);
    const endTimestamp = Timestamp.fromDate(normalizedEnd);

    console.log('dY"? Step 2: Querying with date range...');
    console.log('dY". Start date:', normalizedStart.toISOString());
    console.log('dY". End date:', normalizedEnd.toISOString());
    console.log('dY". Start timestamp:', startTimestamp);
    console.log('dY". End timestamp:', endTimestamp);

    let q = query(
      collection(db, 'locationLogs'),
      where('userId', '==', userId),
      where('createdAt', '>=', startTimestamp),
      where('createdAt', '<=', endTimestamp),
      orderBy('createdAt', 'desc')
    );

    console.log('dY"S Executing Firestore query with createdAt...');
    let querySnapshot;
    let results = [];

    try {
      querySnapshot = await getDocs(q);
      results = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`dY"< Query with createdAt found ${results.length} records`);
    } catch (createdAtError) {
      console.log('?s??,? createdAt query failed, trying timestamp field...', createdAtError?.message);

      q = query(
        collection(db, 'locationLogs'),
        where('userId', '==', userId),
        where('timestamp', '>=', startTimestamp),
        where('timestamp', '<=', endTimestamp),
        orderBy('timestamp', 'desc')
      );

      try {
        querySnapshot = await getDocs(q);
        results = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        console.log(`dY"< Query with timestamp found ${results.length} records`);
      } catch (timestampError) {
        console.log('?s??,? timestamp query also failed, trying without orderBy...', timestampError?.message);

        q = query(
          collection(db, 'locationLogs'),
          where('userId', '==', userId),
          where('timestamp', '>=', startTimestamp),
          where('timestamp', '<=', endTimestamp)
        );

        querySnapshot = await getDocs(q);
        results = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        results.sort((a, b) => {
          const aTime = parseLocationTimestamp(a)?.getTime() || 0;
          const bTime = parseLocationTimestamp(b)?.getTime() || 0;
          return bTime - aTime;
        });

        console.log(`dY"< Fallback query found ${results.length} records`);
      }
    }

    if (!results.length) {
      console.log('?,1?,? No results from range queries. Fetching recent records for user and filtering on client...');
      try {
        const broadQ = query(
          collection(db, 'locationLogs'),
          where('userId', '==', userId),
          limit(1000)
        );
        const broadSnap = await getDocs(broadQ);
        const all = broadSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const startMs = normalizedStart.getTime();
        const endMs = normalizedEnd.getTime();

        const parseMs = (r) => {
          const occurrence = parseLocationTimestamp(r);
          return occurrence ? occurrence.getTime() : 0;
        };

        console.log('dY"< Client-side filtering with date range:', {
          startMs,
          endMs,
          startDate: new Date(startMs).toISOString(),
          endDate: new Date(endMs).toISOString(),
          totalRecords: all.length
        });

        results = all
          .filter(r => {
            const ms = parseMs(r);
            const inRange = ms && ms >= startMs && ms <= endMs;
            if (!inRange) {
              console.log('dY"< Filtering out record outside date range:', {
                id: r.id,
                userId: r.userId,
                timestamp: r.timestamp,
                createdAt: r.createdAt,
                parsedMs: ms,
                startMs,
                endMs
              });
            }
            return inRange;
          })
          .sort((a, b) => parseMs(b) - parseMs(a));

        console.log(`?o. Broad fetch produced ${results.length} records after client-side filtering`);
      } catch (broadErr) {
        console.log('??O Broad fetch failed:', broadErr?.message);
      }
    }

    console.log(`dY"< Processing ${results.length} raw records for normalization`);
    
    const normalized = results
      .map(record => {
        const normalized = normalizeLocationRecord(record);
        let timestampSource = 'none';
        try {
          if (record?.createdAt && (typeof record.createdAt?.toDate === 'function' || typeof record.createdAt?.toMillis === 'function' || record.createdAt?.seconds !== undefined)) {
            timestampSource = 'createdAt';
          } else if (record?.timestamp) {
            timestampSource = 'timestamp';
          } else if (record?.createdAtISO) {
            timestampSource = 'createdAtISO';
          } else if (record?.location?.timestamp) {
            timestampSource = 'location.timestamp';
          }
        } catch {}
        console.log('dY"< Normalizing record:', {
          id: record.id,
          userId: record.userId,
          timestamp: record.timestamp,
          createdAt: record.createdAt,
          timestampSource,
          occurredAtMs: normalized.occurredAtMs,
          occurredAtISO: normalized.occurredAtISO
        });
        return normalized;
      })
      .filter((r) => {
        const hasTimestamp = !!r.occurredAtMs;
        if (!hasTimestamp) {
          console.log('dY"< Filtering out record without timestamp:', {
            id: r.id,
            userId: r.userId,
            timestamp: r.timestamp,
            createdAt: r.createdAt
          });
        }
        return hasTimestamp;
      });

    console.log(`dY"< Final result: ${normalized.length} location records for user ${userId}`);

    if (normalized.length > 0) {
      console.log('dY", Sample result record:', normalized[0]);
    }

    return normalized;
  } catch (error) {
    console.error('??O Error fetching user location data:', error);
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
    console.log('👥 Fetching users with location data...');
    
    // Try different query approaches
    let querySnapshot;
    let users = new Map();
    
    try {
      // First try with createdAt field
      const q = query(collection(db, 'locationLogs'), orderBy('createdAt', 'desc'));
      querySnapshot = await getDocs(q);
      console.log('👥 Query with createdAt successful');
    } catch (createdAtError) {
      console.log('👥 createdAt query failed, trying without orderBy:', createdAtError?.message);
      try {
        // Try without orderBy
        const q = query(collection(db, 'locationLogs'));
        querySnapshot = await getDocs(q);
        console.log('👥 Query without orderBy successful');
      } catch (noOrderByError) {
        console.log('👥 All queries failed:', noOrderByError?.message);
        return [];
      }
    }
    
    querySnapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log('👥 Processing location record:', { id: doc.id, userId: data.userId, userName: data.userName });
      if (data.userId) {
        users.set(data.userId, {
          id: data.userId,
          name: data.userName || data.userId
        });
      }
    });
    
    const userList = Array.from(users.values());
    console.log(`👥 Found ${userList.length} users with location data:`, userList);
    return userList;
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
  console.log('🧪 Testing location logging...');
  console.log('🧪 User ID:', userId);
  console.log('🧪 User Name:', userName);
  
  // Test if getCurrentLocation works
  try {
    console.log('🧪 Testing getCurrentLocation...');
    const location = await getCurrentLocation();
    console.log('🧪 Location result:', location);
    
    if (!location) {
      console.log('❌ getCurrentLocation returned null - permission denied or not supported');
      return false;
    }
  } catch (error) {
    console.log('❌ getCurrentLocation failed:', error);
    return false;
  }
  
  const success = await logLocationData(userId, userName, 'test_action', 'test_button', {
    test: true,
    timestamp: new Date().toISOString()
  });
  
  if (success) {
    console.log('✅ Test location logged successfully!');
    // Wait a moment and then try to fetch it back
    setTimeout(async () => {
      console.log('🔄 Testing data retrieval...');
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const testData = await getUserLocationData(userId, startDate, now);
      console.log(`📊 Retrieved ${testData.length} records after test logging`);
    }, 2000);
  } else {
    console.log('❌ Test location logging failed!');
  }
  
  return success;
};

/**
 * Debug function to check what's in the database
 * @param {string} userId - User ID to check
 */
export const debugLocationData = async (userId) => {
  console.log('🔍 Debugging location data for user:', userId);
  
  try {
    // Get all records for this user
    const allQuery = query(
      collection(db, 'locationLogs'),
      where('userId', '==', userId)
    );
    const allSnapshot = await getDocs(allQuery);
    const allRecords = allSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📊 Total records for user ${userId}:`, allRecords.length);
    
    if (allRecords.length > 0) {
      console.log('📄 All records:', allRecords);
      
      // Check date ranges
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      console.log('📅 Date ranges:');
      console.log('  Now:', now.toISOString());
      console.log('  1 day ago:', oneDayAgo.toISOString());
      console.log('  7 days ago:', sevenDaysAgo.toISOString());
      
      // Check record timestamps
      allRecords.forEach((record, index) => {
        console.log(`📄 Record ${index + 1}:`, {
          id: record.id,
          createdAt: record.createdAt,
          timestamp: record.timestamp,
          createdAtISO: record.createdAtISO,
          action: record.action,
          location: record.location
        });
      });
    }
    
    return allRecords;
  } catch (error) {
    console.error('❌ Error debugging location data:', error);
    return [];
  }
};


export const getUsersLocationStats = async (userIds, startDate, endDate) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  try {
    const s = startDate instanceof Date ? startDate : new Date(startDate);
    const e = endDate instanceof Date ? endDate : new Date(endDate);
    const startTimestamp = Timestamp.fromDate(s);
    const endTimestamp = Timestamp.fromDate(e);

    const q = query(
      collection(db, 'locationLogs'),
      where('userId', 'in', userIds),
      where('createdAt', '>=', startTimestamp),
      where('createdAt', '<=', endTimestamp)
    );

    const querySnapshot = await getDocs(q);
    const records = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const stats = userIds.reduce((acc, userId) => {
      acc[userId] = { totalLocations: 0, activeDays: new Set(), lastLocation: null };
      return acc;
    }, {});

    records.forEach(record => {
      const normalized = normalizeLocationRecord(record);
      if (normalized.occurredAtISO) {
        const userId = record.userId;
        if (stats[userId]) {
          stats[userId].totalLocations++;
          const day = normalized.occurredAtISO.split('T')[0];
          stats[userId].activeDays.add(day);
          if (!stats[userId].lastLocation || new Date(normalized.occurredAtISO) > new Date(stats[userId].lastLocation)) {
            stats[userId].lastLocation = normalized.occurredAtISO;
          }
        }
      }
    });

    // Convert Set to size
    Object.keys(stats).forEach(userId => {
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



