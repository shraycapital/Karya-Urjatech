/**
 * Voucher Management Utility
 * 
 * Handles voucher products, purchasing, and user voucher inventory.
 */

import { db } from '../../firebase';
import { collection, getDocs, doc, serverTimestamp, query, collectionGroup, orderBy, setDoc, getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { cleanFirestoreData } from './firestoreHelpers';
import { redeemPoints, calculateUsablePoints, calculateTotalPoints, POINTS_CONFIG } from './pointsManagement';
import { getVoucherProducts } from './voucherProducts';

/**
 * Get all active voucher products from Firestore
 * @returns {Promise<Array>} Array of voucher products
 */
export async function getAvailableProducts() {
  try {
    const products = await getVoucherProducts();
    return products.filter(product => product.isActive);
  } catch (error) {
    console.error('Error getting available products:', error);
    return [];
  }
}

/**
 * Calculate total points for cart
 * @param {Array} cartItems - Cart items with { productId, quantity }
 * @param {Array} products - Available products
 * @returns {number} Total points
 */
export function calculateCartTotal(cartItems, products = []) {
  return cartItems.reduce((total, item) => {
    const product = products.find(p => p.id === item.productId);
    return total + (product ? product.points * item.quantity : 0);
  }, 0);
}

/**
 * Get current month identifier (YYYY-MM format)
 */
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Purchase vouchers (redeem points and add to user inventory)
 * @param {string} userId - User ID
 * @param {string} userName - User name
 * @param {Array} cartItems - Cart items with { productId, quantity }
 * @returns {Promise<Object>} Result
 */
export async function purchaseVouchers(userId, userName, cartItems) {
  try {
    if (!userId || !cartItems || cartItems.length === 0) {
      throw new Error('Invalid parameters');
    }

    // Normalize the incoming cart to guard against duplicate product rows
    // and non-integer / invalid quantities.
    const normalizedCartItems = Object.values(
      cartItems.reduce((acc, item) => {
        const normalizedQuantity = Number.parseInt(item?.quantity, 10);
        if (!item?.productId || !Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
          throw new Error('Invalid cart items');
        }
        if (!acc[item.productId]) {
          acc[item.productId] = { productId: item.productId, quantity: 0 };
        }
        acc[item.productId].quantity += normalizedQuantity;
        return acc;
      }, {})
    );

    // Build a unique list of product IDs in the cart
    const productIds = normalizedCartItems.map(i => i.productId);

    // Run end-to-end purchase in a single transaction to avoid race conditions
    const result = await runTransaction(db, async (tx) => {
      // 1) Load products and validate availability & active status
      const productsById = {};
      const availabilityErrors = [];
      for (const productId of productIds) {
        const productRef = doc(db, 'voucherProducts', productId);
        const productSnap = await tx.get(productRef);
        if (!productSnap.exists()) {
          availabilityErrors.push({ productId, productName: 'Unknown', error: 'Product not found' });
          continue;
        }
        const product = { id: productSnap.id, ...productSnap.data() };
        productsById[productId] = { product, ref: productRef };

        if (!product.isActive) {
          availabilityErrors.push({ productId, productName: product.name || product.heading, error: 'Product is not live' });
          continue;
        }
      }

      // Validate quantities per item
      for (const item of normalizedCartItems) {
        const entry = productsById[item.productId];
        if (!entry) continue; // already has an error
        const { product } = entry;
        const totalQuantity = product.totalQuantity || 0;
        const redeemedQuantity = product.redeemedQuantity || 0;
        const availableQuantity = Math.max(0, totalQuantity - redeemedQuantity);
        if (availableQuantity < item.quantity) {
          availabilityErrors.push({
            productId: item.productId,
            productName: product.name || product.heading,
            error: `Only ${availableQuantity} voucher(s) available (requested: ${item.quantity})`,
            availableQuantity,
            requestedQuantity: item.quantity,
          });
        }
      }

      if (availabilityErrors.length > 0) {
        const message = availabilityErrors.map(e => `${e.productName}: ${e.error}`).join(', ');
        throw new Error(message);
      }

      // 2) Calculate total points based on latest product pricing
      const totalPoints = normalizedCartItems.reduce((sum, item) => {
        const entry = productsById[item.productId];
        const points = entry?.product?.points || 0;
        return sum + (points * item.quantity);
      }, 0);
      if (totalPoints <= 0) {
        throw new Error('Invalid cart items');
      }

      // 3) Load user and deduct points from oldest-first entries
      const userRef = doc(db, 'users', userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      const userData = userSnap.data();

      // Prepare points history - create opening balance if missing
      const pointsHistory = { ...(userData.pointsHistory || {}) };
      const hasPointsHistory = Object.keys(pointsHistory).length > 0;
      if (!hasPointsHistory) {
        const fallbackPoints = (userData.totalTCS || userData.weeklyTCS || 0);
        if (fallbackPoints > 0) {
          const todayKey = new Date().toISOString().slice(0, 10);
          pointsHistory[todayKey] = {
            points: Math.floor(fallbackPoints),
            isUsable: true,
            addedAt: serverTimestamp(),
            expirationDays: 90,
          };
        }
      }

      // Compute usable and perform deduction oldest-first
      let remainingToRedeem = totalPoints;
      const sortedEntries = Object.entries(pointsHistory).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const now = new Date();
      for (const [dateKey, entry] of sortedEntries) {
        if (remainingToRedeem <= 0) break;
        if (!entry || typeof entry.points !== 'number' || entry.points <= 0 || entry.isUsable === false) continue;
        // Basic expiry calc: dateKey is YYYY-MM-DD
        const expiration = new Date(dateKey);
        expiration.setDate(expiration.getDate() + (entry.expirationDays || 90));
        if (now > expiration) {
          entry.isUsable = false;
          continue;
        }
        const deduct = Math.min(remainingToRedeem, entry.points);
        entry.points -= deduct;
        remainingToRedeem -= deduct;
        if (entry.points <= 0) entry.isUsable = false;
      }

      if (remainingToRedeem > 0) {
        throw new Error('Insufficient points');
      }

      // Recompute user aggregates
      const updatedUsable = calculateUsablePoints({ ...userData, pointsHistory });
      const updatedTotal = calculateTotalPoints({ ...userData, pointsHistory });

      // 4) Create vouchers and update product counters
      const timestamp = serverTimestamp();
      const currentMonth = getCurrentMonth();
      const vouchersCreated = [];
      for (const item of normalizedCartItems) {
        const { product, ref: productRef } = productsById[item.productId];
        // Create one doc per quantity
        for (let i = 0; i < item.quantity; i++) {
          const voucherData = cleanFirestoreData({
            userId,
            userName,
            productId: item.productId,
            productName: product.name,
            productIcon: product.icon,
            pointsSpent: product.points,
            purchasedAt: timestamp,
            status: 'confirmed',
            redemptionMonth: currentMonth,
            code: generateVoucherCode(),
          });
          const voucherRef = doc(collection(db, 'users', userId, 'vouchers'));
          tx.set(voucherRef, voucherData);
          vouchersCreated.push({ id: voucherRef.id, ...voucherData });
        }

        const newRedeemed = (product.redeemedQuantity || 0) + item.quantity;
        tx.update(productRef, { redeemedQuantity: newRedeemed, updatedAt: timestamp });
      }

      // 5) Update user document
      tx.update(userRef, {
        pointsHistory: cleanFirestoreData(pointsHistory),
        usablePoints: Math.floor(updatedUsable),
        totalPoints: Math.floor(updatedTotal),
        totalRedeemed: Math.floor((userData.totalRedeemed || 0) + totalPoints),
        totalVouchersPurchased: (userData.totalVouchersPurchased || 0) + vouchersCreated.length,
        lastVoucherPurchase: timestamp,
        updatedAt: timestamp,
      });

      return { vouchersCreated, totalPoints };
    });

    return {
      success: true,
      vouchers: result.vouchersCreated,
      totalPointsSpent: result.totalPoints,
      vouchersCreated: result.vouchersCreated.length,
    };

  } catch (error) {
    console.error('Error purchasing vouchers:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate unique voucher code
 * @returns {string} Voucher code
 */
function generateVoucherCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get user's voucher inventory
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of vouchers
 */
export async function getUserVouchers(userId) {
  try {
    const vouchersRef = collection(db, 'users', userId, 'vouchers');
    const q = query(vouchersRef, orderBy('purchasedAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Error fetching user vouchers:', error);
    return [];
  }
}

/**
 * Mark voucher as used
 * @param {string} voucherId - Voucher ID
 * @param {string} usedBy - User ID who is using it
 * @returns {Promise<Object>} Result
 */
export async function useVoucher(voucherId, usedBy) {
  try {
    const voucherRef = doc(db, 'users', usedBy, 'vouchers', voucherId);
    const voucherDoc = await getDoc(voucherRef);
    
    if (!voucherDoc.exists()) {
      throw new Error('Voucher not found');
    }

    const voucherData = voucherDoc.data();
    
    if (voucherData.status === 'used') {
      throw new Error('Voucher has already been used');
    }

    if (voucherData.userId !== usedBy) {
      throw new Error('Unauthorized to use this voucher');
    }

    await updateDoc(voucherRef, {
      status: 'used',
      usedAt: serverTimestamp(),
      usedBy: usedBy,
    });

    return {
      success: true,
      message: 'Voucher redeemed successfully',
    };

  } catch (error) {
    console.error('Error using voucher:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get user's voucher statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Statistics
 */
export async function getUserVoucherStats(userId) {
  try {
    const vouchers = await getUserVouchers(userId);
    
    const stats = {
      total: vouchers.length,
      pending: 0,
      confirmed: 0,
      used: 0,
      expired: 0,
      totalPointsSpent: 0,
    };

    vouchers.forEach(voucher => {
      stats[voucher.status] = (stats[voucher.status] || 0) + 1;
      stats.totalPointsSpent += voucher.pointsSpent || 0;
    });

    return stats;

  } catch (error) {
    console.error('Error fetching voucher stats:', error);
    return {
      total: 0,
      pending: 0,
      confirmed: 0,
      used: 0,
      expired: 0,
      totalPointsSpent: 0,
    };
  }
}

/**
 * Get all redeemed vouchers across all users for admin view.
 * @returns {Promise<Array>} A list of all redeemed vouchers.
 */
export async function getAllRedeemedVouchers() {
  try {
    const vouchersQuery = query(
      collectionGroup(db, 'vouchers'),
      orderBy('purchasedAt', 'desc')
    );
    const querySnapshot = await getDocs(vouchersQuery);
    return querySnapshot.docs.map(doc => ({ 
      id: doc.id, 
      voucherDocPath: doc.ref.path, // Store full path for deletion
      ...doc.data() 
    }));
  } catch (error) {
    console.error('Error getting all redeemed vouchers:', error);
    return [];
  }
}

/**
 * Delete a voucher and refund points to user (Admin function)
 * @param {string} userId - User ID who owns the voucher
 * @param {string} voucherId - Voucher ID to delete
 * @param {string} productId - Product ID of the voucher
 * @param {number} pointsSpent - Points spent on the voucher
 * @param {string} adminId - Admin ID performing the deletion
 * @param {string} reason - Reason for deletion
 * @returns {Promise<Object>} Result
 */
export async function deleteVoucherAndRefund(userId, voucherId, productId, pointsSpent, adminId, reason) {
  try {
    if (!userId || !voucherId || !productId) {
      throw new Error('Missing required parameters');
    }

    // Run deletion and refund in a transaction
    const result = await runTransaction(db, async (tx) => {
      // 1) Get user document
      const userRef = doc(db, 'users', userId);
      const userSnap = await tx.get(userRef);
      
      if (!userSnap.exists()) {
        throw new Error('User not found');
      }
      
      const userData = userSnap.data();
      
      // 2) Get voucher document
      const voucherRef = doc(db, 'users', userId, 'vouchers', voucherId);
      const voucherSnap = await tx.get(voucherRef);
      
      if (!voucherSnap.exists()) {
        throw new Error('Voucher not found');
      }

      const voucherData = voucherSnap.data();
      const actualProductId = voucherData.productId || productId;
      const actualPointsSpent = Number(voucherData.pointsSpent || pointsSpent || 0);

      // 3) Get product document to decrement redeemedQuantity
      const productRef = doc(db, 'voucherProducts', actualProductId);
      const productSnap = await tx.get(productRef);
      
      if (productSnap.exists()) {
        const product = productSnap.data();
        const currentRedeemed = product.redeemedQuantity || 0;
        const newRedeemed = Math.max(0, currentRedeemed - 1);
        tx.update(productRef, { 
          redeemedQuantity: newRedeemed,
          updatedAt: serverTimestamp(),
        });
      }

      // 4) Refund points to user
      const pointsHistory = { ...(userData.pointsHistory || {}) };
      if (Object.keys(pointsHistory).length === 0) {
        const fallbackPoints = Math.floor(userData.totalTCS || userData.weeklyTCS || 0);
        if (fallbackPoints > 0) {
          const seedKey = new Date().toISOString().slice(0, 10);
          pointsHistory[seedKey] = {
            points: fallbackPoints,
            addedAt: serverTimestamp(),
            expirationDays: POINTS_CONFIG.EXPIRATION_DAYS,
            isUsable: true,
            source: 'legacy_tcs_migration',
          };
        }
      }
      const todayKey = new Date().toISOString().slice(0, 10);
      const refundKey = `${todayKey}-refund-${Date.now()}`;
      
      pointsHistory[refundKey] = {
        points: pointsSpent,
        addedAt: serverTimestamp(),
        expirationDays: 90,
        isUsable: true,
        refundReason: reason || 'Voucher deleted by admin',
        refundedBy: adminId,
        refundedVoucherId: voucherId,
      };

      // Recalculate user totals
      const now = new Date();
      const updatedUsable = calculateUsablePoints({ ...userData, pointsHistory });
      const updatedTotal = calculateTotalPoints({ ...userData, pointsHistory });

      // 5) Update user document
      tx.update(userRef, {
        pointsHistory: cleanFirestoreData(pointsHistory),
        usablePoints: Math.floor(updatedUsable),
        totalPoints: Math.floor(updatedTotal),
        totalRedeemed: Math.max(0, (userData.totalRedeemed || 0) - actualPointsSpent),
        totalVouchersPurchased: Math.max(0, (userData.totalVouchersPurchased || 0) - 1),
        updatedAt: serverTimestamp(),
      });

      // 6) Delete voucher
      tx.delete(voucherRef);

      return { refundedPoints: actualPointsSpent };
    });

    return {
      success: true,
      refundedPoints: result.refundedPoints,
      message: 'Voucher deleted and points refunded',
    };

  } catch (error) {
    console.error('Error deleting voucher and refunding points:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

