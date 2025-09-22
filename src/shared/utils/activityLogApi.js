import { db } from '../../firebase';
import { collection, query, orderBy, limit, startAfter, getDocs, where } from 'firebase/firestore';

const ACTIVITY_LOG_COLLECTION = 'activityLog';
const DEFAULT_PAGE_SIZE = 50;

/**
 * Get paginated activity logs
 * @param {number} pageSize - Number of logs to fetch per page
 * @param {string} lastDocId - ID of the last document from previous page (for pagination)
 * @param {string} filter - Filter by action type ('all', 'create', 'update', etc.)
 * @returns {Promise<{logs: Array, hasMore: boolean, lastDoc: Object}>}
 */
export const getPaginatedActivityLogs = async (pageSize = DEFAULT_PAGE_SIZE, lastDocId = null, filter = 'all') => {
  try {
    let q = query(
      collection(db, ACTIVITY_LOG_COLLECTION),
      orderBy('timestamp', 'desc')
    );

    // Apply filter if not 'all'
    if (filter !== 'all') {
      q = query(q, where('action', '==', filter));
    }

    // Apply pagination
    q = query(q, limit(pageSize + 1)); // Fetch one extra to check if there are more

    const snapshot = await getDocs(q);
    const allDocs = snapshot.docs;
    
    // Check if there are more documents
    const hasMore = allDocs.length > pageSize;
    const logs = allDocs.slice(0, pageSize).map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      logs,
      hasMore,
      lastDoc: hasMore ? allDocs[pageSize - 1] : null
    };
  } catch (error) {
    console.error('Error fetching paginated activity logs:', error);
    return {
      logs: [],
      hasMore: false,
      lastDoc: null
    };
  }
};

/**
 * Get activity logs with cursor-based pagination
 * @param {number} pageSize - Number of logs to fetch per page
 * @param {Object} startAfterDoc - Document to start after (for cursor pagination)
 * @param {string} filter - Filter by action type
 * @returns {Promise<{logs: Array, hasMore: boolean, lastDoc: Object}>}
 */
export const getActivityLogsWithCursor = async (pageSize = DEFAULT_PAGE_SIZE, startAfterDoc = null, filter = 'all') => {
  try {
    let q = query(
      collection(db, ACTIVITY_LOG_COLLECTION),
      orderBy('timestamp', 'desc')
    );

    // Apply filter if not 'all'
    if (filter !== 'all') {
      console.log('Filtering activity logs by action:', filter);
      q = query(q, where('action', '==', filter));
    }

    // Apply cursor pagination
    if (startAfterDoc) {
      q = query(q, startAfter(startAfterDoc));
    }

    // Fetch one extra to check if there are more
    q = query(q, limit(pageSize + 1));

    const snapshot = await getDocs(q);
    const allDocs = snapshot.docs;
    
    console.log(`Found ${allDocs.length} documents for filter "${filter}"`);
    
    // Check if there are more documents
    const hasMore = allDocs.length > pageSize;
    const logs = allDocs.slice(0, pageSize).map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      logs,
      hasMore,
      lastDoc: hasMore ? allDocs[pageSize - 1] : null
    };
  } catch (error) {
    // Fallback when composite index is missing (failed-precondition)
    console.warn('Primary activity log query failed, trying fallback without orderBy. Error:', error?.message || error);
    try {
      let q = collection(db, ACTIVITY_LOG_COLLECTION);
      if (filter !== 'all') {
        q = query(q, where('action', '==', filter));
      } else {
        q = query(q, limit(pageSize + 1));
      }

      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      // Sort client-side by timestamp descending (supports string ISO or Firestore Timestamp)
      const toMillis = (ts) => {
        if (!ts) return 0;
        try {
          if (typeof ts === 'string') return new Date(ts).getTime() || 0;
          if (ts.seconds) return ts.seconds * 1000;
          if (ts.toDate) return ts.toDate().getTime();
        } catch {}
        return 0;
      };

      docs.sort((a, b) => (toMillis(b.timestamp || b.serverTimestamp) - toMillis(a.timestamp || a.serverTimestamp)));
      const logs = docs.slice(0, pageSize);

      return {
        logs,
        hasMore: docs.length > pageSize && filter === 'all', // conservative until index is added
        lastDoc: null
      };
    } catch (fallbackError) {
      console.error('Fallback activity log query also failed:', fallbackError);
      return { logs: [], hasMore: false, lastDoc: null };
    }
  }
};

/**
 * Get total count of activity logs (for display purposes)
 * @param {string} filter - Filter by action type
 * @returns {Promise<number>}
 */
export const getActivityLogCount = async (filter = 'all') => {
  try {
    let q = query(collection(db, ACTIVITY_LOG_COLLECTION));
    
    if (filter !== 'all') {
      console.log('Counting activity logs for action:', filter);
      q = query(q, where('action', '==', filter));
    }

    const snapshot = await getDocs(q);
    console.log(`Total count for filter "${filter}": ${snapshot.size}`);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting activity log count:', error);
    return 0;
  }
};

/**
 * Get all unique action types in the activity log (for debugging)
 * @returns {Promise<Array<string>>}
 */
export const getAllActionTypes = async () => {
  try {
    const q = query(collection(db, ACTIVITY_LOG_COLLECTION));
    const snapshot = await getDocs(q);
    const actions = new Set();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.action) {
        actions.add(data.action);
      }
    });
    
    const actionArray = Array.from(actions).sort();
    console.log('All action types in database:', actionArray);
    return actionArray;
  } catch (error) {
    console.error('Error getting action types:', error);
    return [];
  }
};
