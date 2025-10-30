/**
 * Firestore Helper Utilities
 * 
 * Common utilities for working with Firestore to prevent common errors
 * and ensure data consistency.
 */

/**
 * Removes undefined values from an object before sending to Firestore
 * Firestore doesn't allow undefined values in documents
 * 
 * @param {Object} obj - The object to clean
 * @returns {Object} - Object with undefined values removed
 */
export const cleanFirestoreData = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  return Object.fromEntries(
    Object.entries(obj).filter(([key, value]) => value !== undefined)
  );
};

/**
 * Safely updates a Firestore document with cleaned data
 * This is a wrapper around updateDoc that automatically cleans undefined values
 * 
 * @param {DocumentReference} docRef - The Firestore document reference
 * @param {Object} data - The data to update (undefined values will be removed)
 * @returns {Promise} - Promise that resolves when update is complete
 */
export const safeUpdateDoc = async (docRef, data) => {
  const { updateDoc } = await import('firebase/firestore');
  const cleanData = cleanFirestoreData(data);
  return updateDoc(docRef, cleanData);
};

/**
 * Safely sets a Firestore document with cleaned data
 * This is a wrapper around setDoc that automatically cleans undefined values
 * 
 * @param {DocumentReference} docRef - The Firestore document reference
 * @param {Object} data - The data to set (undefined values will be removed)
 * @param {Object} options - Optional setDoc options
 * @returns {Promise} - Promise that resolves when set is complete
 */
export const safeSetDoc = async (docRef, data, options = {}) => {
  const { setDoc } = await import('firebase/firestore');
  const cleanData = cleanFirestoreData(data);
  return setDoc(docRef, cleanData, options);
};
