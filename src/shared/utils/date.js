// ⚠️ CRITICAL: This application uses Firestore timestamp format throughout
// All dates/times are stored as: { seconds: number, nanoseconds: number }
// See FIRESTORE_TIMESTAMP_GUIDE.md for complete documentation
// 
// Indian Standard Time (IST) utilities
export const getISTDate = () => {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  return new Date(utc + istOffset);
};

export const toISTISOString = (date = new Date()) => {
  const istDate = getISTDate();
  if (date !== new Date()) {
    // If a specific date is passed, convert it to IST
    const utc = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    return istDate.toISOString();
  }
  return istDate.toISOString();
};

export const toISTDateString = (date = new Date()) => {
  const istDate = getISTDate();
  if (date !== new Date()) {
    // If a specific date is passed, convert it to IST
    const utc = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utc + istOffset);
    return istDate.toISOString().split('T')[0];
  }
  return istDate.toISOString().split('T')[0];
};

export const toSafeDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  // Firestore Timestamp support: has toDate() or seconds
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof value.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
};

export const formatDateTime = (value, locale = 'en-IN') => {
  const d = toSafeDate(value);
  return d ? d.toLocaleString(locale, { 
    dateStyle: 'short', 
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata' // Use IST timezone
  }) : 'N/A';
};

export const formatDateOnly = (value, locale = 'en-IN') => {
  const d = toSafeDate(value);
  return d ? d.toLocaleDateString(locale, { 
    dateStyle: 'medium',
    timeZone: 'Asia/Kolkata' // Use IST timezone
  }) : 'N/A';
};

export const formatDate = (value) => {
  // Backwards-compatible alias used across the app
  return formatDateTime(value);
};

/**
 * ⚠️ CRITICAL: Parse Firestore timestamp format
 * This is the ONLY safe way to parse dates in this application
 * 
 * @param {Object|string|Date} timestamp - Firestore timestamp or regular date
 * @returns {Date|null} Parsed date or null if invalid
 * 
 * @example
 * // Firestore timestamp
 * const firestoreTimestamp = { seconds: 1759301556, nanoseconds: 884000000 };
 * const date = parseFirestoreTimestamp(firestoreTimestamp);
 * 
 * // Regular date
 * const regularDate = parseFirestoreTimestamp("2025-10-02T10:30:00Z");
 */
export const parseFirestoreTimestamp = (timestamp) => {
  if (!timestamp) return null;
  
  // Handle Firestore timestamp with seconds/nanoseconds
  if (timestamp.seconds !== undefined) {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000);
  }
  
  // Handle Firestore timestamp with toDate method
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // Handle regular Date objects
  if (timestamp instanceof Date) {
    return isNaN(timestamp.getTime()) ? null : timestamp;
  }
  
  // Handle strings and numbers
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
};

/**
 * ⚠️ CRITICAL: Compare two Firestore timestamps
 * 
 * @param {Object|string|Date} timestamp1 - First timestamp
 * @param {Object|string|Date} timestamp2 - Second timestamp
 * @returns {number} -1 if timestamp1 < timestamp2, 0 if equal, 1 if timestamp1 > timestamp2
 */
export const compareFirestoreTimestamps = (timestamp1, timestamp2) => {
  const date1 = parseFirestoreTimestamp(timestamp1);
  const date2 = parseFirestoreTimestamp(timestamp2);
  
  if (!date1 || !date2) return 0;
  
  return date1.getTime() - date2.getTime();
};

/**
 * ⚠️ CRITICAL: Check if timestamp is within date range
 * 
 * @param {Object|string|Date} timestamp - Timestamp to check
 * @param {Date} startDate - Start of range
 * @param {Date} endDate - End of range
 * @returns {boolean} True if timestamp is within range
 */
export const isTimestampInRange = (timestamp, startDate, endDate) => {
  const date = parseFirestoreTimestamp(timestamp);
  if (!date) return false;
  
  return date >= startDate && date < endDate;
};
