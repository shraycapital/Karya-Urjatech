/**
 * Weekly Reset API Functions
 * 
 * Handles API calls for weekly leaderboard resets and related functionality.
 */

// Note: Using direct HTTP calls instead of Firebase Functions SDK
// since functions is not available in the current Firebase setup

/**
 * Trigger manual weekly reset (Admin only)
 * @param {string} adminUserId - Admin user ID
 * @returns {Promise<Object>} Reset result
 */
export const triggerManualWeeklyReset = async (adminUserId) => {
  try {
    const response = await fetch('https://asia-south1-kartavya-58d2c.cloudfunctions.net/manualWeeklyReset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ adminUserId })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error triggering manual weekly reset:', error);
    throw error;
  }
};

/**
 * Get weekly leaderboard history
 * @param {number} limit - Number of weeks to retrieve
 * @returns {Promise<Object>} Weekly history data
 */
export const getWeeklyLeaderboardHistory = async (limit = 4) => {
  try {
    // This would typically be a Firestore query, but for now we'll return a placeholder
    // In a real implementation, you'd query the weeklyLeaderboardArchives collection
    return {
      success: true,
      archives: []
    };
  } catch (error) {
    console.error('Error fetching weekly leaderboard history:', error);
    return { success: false, error: error.message, archives: [] };
  }
};

/**
 * Get last weekly reset information
 * @returns {Promise<Object>} Last reset data
 */
export const getLastWeeklyReset = async () => {
  try {
    // This would query the system/weeklyReset document
    // For now, return a placeholder
    return {
      success: true,
      lastReset: null,
      resetCount: 0
    };
  } catch (error) {
    console.error('Error fetching last weekly reset:', error);
    return { success: false, error: error.message };
  }
};
