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
