import { db } from "../../firebase";
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getCurrentLocation } from './location.js';
import { toISTISOString } from './date.js';

// Enhanced activity logging with comprehensive tracking
export const logActivity = async (action, entityType, entityId, entityName, userId, userName, details = {}, includeLocation = false) => {
  try {
    // Only get location if explicitly requested and we have user permission
    let location = null;
    if (includeLocation) {
      try {
        location = await getCurrentLocation();
      } catch (error) {
        console.log('Location not available for activity log:', error.message);
      }
    }

    // Improve user name resolution
    // Resolve userId from localStorage if missing
    let finalUserId = userId || localStorage.getItem('kartavya_userId') || 'anonymous';

    let finalUserName = userName;
    if (!finalUserName || finalUserName === 'Anonymous' || finalUserName === 'Unknown' || finalUserName === 'Unknown User') {
      try {
        // Try to get from global users array
        if (typeof window !== 'undefined' && window.kartavyaUsers && finalUserId) {
          const user = window.kartavyaUsers.find(u => u.id === finalUserId);
          if (user) {
            finalUserName = user.name || user.username || user.email || `User-${finalUserId.substring(0, 8)}`;
          }
        }
        
        // Try to get from localStorage
        if (!finalUserName || finalUserName === 'Anonymous' || finalUserName === 'Unknown' || finalUserName === 'Unknown User') {
          const currentUserData = localStorage.getItem('kartavya_currentUser');
          if (currentUserData) {
            const user = JSON.parse(currentUserData);
            if (!finalUserId) finalUserId = user.id;
            if (!finalUserName) {
              finalUserName = user.name || user.username || user.email || `User-${(user.id || '').substring(0, 8)}`;
            }
          }
        }
        
        // Final fallback
        if (!finalUserName || finalUserName === 'Anonymous' || finalUserName === 'Unknown' || finalUserName === 'Unknown User') {
          finalUserName = `User-${finalUserId && finalUserId !== 'anonymous' ? finalUserId.substring(0, 8) : 'Unknown'}`;
        }
      } catch (error) {
        console.warn('Error resolving user name:', error);
        finalUserName = `User-${finalUserId && finalUserId !== 'anonymous' ? finalUserId.substring(0, 8) : 'Unknown'}`;
      }
    }

    const logEntry = {
      action,
      entityType,
      entityId,
      entityName,
      userId: finalUserId,
      userName: finalUserName,
      details,
      location, // Add location data to the log (null if not requested)
      timestamp: toISTISOString(),
      serverTimestamp: serverTimestamp(), // Add server timestamp for consistency
      sessionId: getSessionId(), // Add session tracking
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
    await addDoc(collection(db, 'activityLog'), logEntry);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

// Helper function to get session ID
function getSessionId() {
  try {
    let sessionId = sessionStorage.getItem('activity_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('activity_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Convenience functions for common activities
export const logTaskActivity = async (action, task, userId, userName, details = {}, includeLocation = false) => {
  return await logActivity(action, 'task', task.id, task.title, userId, userName, {
    taskStatus: task.status,
    taskDifficulty: task.difficulty,
    taskPoints: task.points,
    departmentId: task.departmentId,
    assignedUserIds: task.assignedUserIds,
    ...details
  }, includeLocation);
};

export const logUserActivity = async (action, user, currentUserId, currentUserName, details = {}, includeLocation = false) => {
  return await logActivity(action, 'user', user.id, user.name || user.username || user.email, currentUserId, currentUserName, {
    userRole: user.role,
    userDepartments: user.departmentIds,
    ...details
  }, includeLocation);
};

export const logDepartmentActivity = async (action, department, currentUserId, currentUserName, details = {}, includeLocation = false) => {
  return await logActivity(action, 'department', department.id, department.name, currentUserId, currentUserName, details, includeLocation);
};

export const logSystemActivity = async (action, entityType, entityId, entityName, userId, userName, details = {}, includeLocation = false) => {
  return await logActivity(action, entityType, entityId, entityName, userId, userName, {
    systemEvent: true,
    ...details
  }, includeLocation);
};

export const logPWAActivity = async (action, details = {}, userId, userName, includeLocation = false) => {
  return await logActivity(action, 'pwa', 'system', 'PWA System', userId, userName, {
    pwaEvent: true,
    ...details
  }, includeLocation);
};

