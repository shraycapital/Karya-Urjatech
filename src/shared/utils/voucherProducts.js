/**
 * Voucher Products Management Utility
 * 
 * Handles voucher products stored in Firestore, not hardcoded.
 * Management users can add/edit voucher products.
 */

import { db } from '../../firebase';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, getDoc, collectionGroup } from 'firebase/firestore';
import { cleanFirestoreData } from './firestoreHelpers';

/**
 * Get all voucher products from Firestore
 * @returns {Promise<Array>} Array of voucher products
 */
export async function getVoucherProducts() {
  try {
    const vouchersRef = collection(db, 'voucherProducts');
    const q = query(vouchersRef, orderBy('points', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error fetching voucher products:', error);
    return [];
  }
}

/**
 * Get all voucher products including drafts (for management view)
 * @returns {Promise<Array>} Array of all voucher products (live and draft)
 */
export async function getAllVoucherProducts() {
  try {
    const vouchersRef = collection(db, 'voucherProducts');
    const q = query(vouchersRef, orderBy('points', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error fetching all voucher products:', error);
    return [];
  }
}

/**
 * Add a new voucher product (Management only)
 * @param {Object} productData - Product data
 * @returns {Promise<Object>} Result with product ID
 */
export async function addVoucherProduct(productData) {
  try {
    const voucherProductData = {
      ...productData,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Draft/live toggle
      isActive: productData?.isActive === true,
      totalQuantity: parseInt(productData.totalQuantity) || 0,
      redeemedQuantity: 0,
    };

    const cleanProductData = cleanFirestoreData(voucherProductData);
    const docRef = await addDoc(collection(db, 'voucherProducts'), cleanProductData);
    
    return {
      success: true,
      productId: docRef.id,
    };
  } catch (error) {
    console.error('Error adding voucher product:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update a voucher product (Management only)
 * @param {string} productId - Product ID
 * @param {Object} updates - Updated product data
 * @returns {Promise<Object>} Result
 */
export async function updateVoucherProduct(productId, updates) {
  try {
    const cleanUpdates = cleanFirestoreData({
      ...updates,
      updatedAt: new Date(),
      totalQuantity: parseInt(updates.totalQuantity) || 0,
      // Respect explicit toggle
      ...(typeof updates.isActive === 'boolean' ? { isActive: updates.isActive } : {}),
    });
    
    await updateDoc(doc(db, 'voucherProducts', productId), cleanUpdates);
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error updating voucher product:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Delete a voucher product (Management only)
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Result
 */
export async function deleteVoucherProduct(productId) {
  try {
    await deleteDoc(doc(db, 'voucherProducts', productId));
    
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error deleting voucher product:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get redemption summary for all voucher products (Management view)
 * @returns {Promise<Array>} Array of redemption summaries
 */
export async function getRedemptionSummary() {
  try {
    // Get all voucher products
    const products = await getVoucherProducts();
    
    // Get all vouchers from user subcollections using collectionGroup
    const vouchersSnap = await getDocs(collectionGroup(db, 'vouchers'));
    const allVouchers = vouchersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate summary for each product
    const summaries = products.map(product => {
      const productVouchers = allVouchers.filter(v => v.productId === product.id);
      const confirmed = productVouchers.filter(v => v.status === 'confirmed').length;
      const used = productVouchers.filter(v => v.status === 'used').length;
      
      return {
        productId: product.id,
        productName: product.name || product.heading,
        points: product.points,
        totalQuantity: product.totalQuantity || 0,
        redeemedQuantity: confirmed,
        availableQuantity: Math.max(0, (product.totalQuantity || 0) - confirmed),
        usedQuantity: used,
        pendingQuantity: Math.max(0, confirmed - used),
        isAvailable: confirmed < (product.totalQuantity || 0),
        isActive: !!product.isActive,
      };
    });
    
    return summaries;
  } catch (error) {
    console.error('Error getting redemption summary:', error);
    return [];
  }
}

/**
 * Check if a voucher product is fully redeemed
 * @param {Object} product - Product object
 * @returns {boolean} True if fully redeemed
 */
export function isProductFullyRedeemed(product) {
  const totalQuantity = product.totalQuantity || 0;
  const redeemedQuantity = product.redeemedQuantity || 0;
  return totalQuantity > 0 && redeemedQuantity >= totalQuantity;
}

