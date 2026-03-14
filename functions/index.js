/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { onCall } = require("firebase-functions/v2/https");
const { HttpsError } = require("firebase-functions/v2/https");

const { PWAAnalyticsProcessor } = require('./pwaAnalyticsProcessor');

// Initialize Firebase Admin
admin.initializeApp();

// For cost control and region alignment with Firestore (asia-south1)
setGlobalOptions({ maxInstances: 10, region: 'asia-south1' });

// Helper: chunk array (Firestore `in` supports max 10 ids)
function chunkArray(arr, size = 10) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Helper: get department head user IDs for a department
async function getDepartmentHeadIds(departmentId) {
  if (!departmentId) return [];
  const db = admin.firestore();
  const snap = await db
    .collection('users')
    .where('role', '==', 'Head')
    .where('departmentIds', 'array-contains', departmentId)
    .get();
  return snap.docs.map((d) => d.id);
}

// Helper: fetch FCM tokens for specific user ids
async function getTokensForUserIds(userIds = []) {
  const db = admin.firestore();
  const uniqueIds = [...new Set((userIds || []).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const tokens = [];
  const chunks = chunkArray(uniqueIds, 10); // Firestore 'in' limit
  for (const chunk of chunks) {
    const snap = await db
      .collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    snap.forEach((doc) => {
      const data = doc.data() || {};
      if (Array.isArray(data.fcmTokens)) {
        tokens.push(...data.fcmTokens);
      }
    });
  }
  return tokens;
}

// Function to send push notifications; if targetUserIds provided, only notify those users
async function sendPushNotificationToAll(title, body, data = {}, targetUserIds = null) {
  try {
    const db = admin.firestore();
    
    let tokens = [];

    if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      tokens = await getTokensForUserIds(targetUserIds);
    } else {
      // Broadcast fallback (existing behavior)
      const usersSnapshot = await db.collection('users').get();
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens);
        }
      });
    }
    
    if (tokens.length === 0) {
      logger.info('No FCM tokens found for target audience');
      return { success: false, message: 'No FCM tokens found' };
    }
    
    // Remove duplicates
    const uniqueTokens = [...new Set(tokens)];
    
    // Send to each token - include webpush config for PWAs
    const host = 'https://karya.urja.tech';
    const iconUrl = `${host}/favicon.ico`;
    const computedLink = (data && data.taskId) ? `${host}/?task=${encodeURIComponent(data.taskId)}` : host;
    const messages = uniqueTokens.map(token => ({
      token,
      data: {
        ...data,
        link: computedLink,
      },
      webpush: {
        notification: {
          title,
          body,
          icon: iconUrl,
        },
        fcmOptions: {
          link: computedLink,
        },
        headers: {
          TTL: '3600'
        }
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    }));
    
    // Send in batches (FCM allows max 500 per batch)
    const batchSize = 500;
    let successCount = 0;
    let failureCount = 0;
    
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      try {
        const response = await admin.messaging().sendAll(batch);
        successCount += response.successCount;
        failureCount += response.failureCount;
        
        if (response.failureCount > 0) {
          logger.warn(`Batch ${i / batchSize + 1} had ${response.failureCount} failures`);
        }
      } catch (error) {
        logger.error(`Error sending batch ${i / batchSize + 1}:`, error);
        failureCount += batch.length;
      }
    }
    
    logger.info(`Push notification sent: ${successCount} success, ${failureCount} failures`);
    return { 
      success: true, 
      successCount, 
      failureCount, 
      totalTokens: uniqueTokens.length 
    };
    
  } catch (error) {
    logger.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

// HTTP endpoint to manually send notifications
exports.sendNotification = onRequest(async (request, response) => {
  // Enhanced CORS support
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.set('Access-Control-Max-Age', '3600');
  
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }
  
  try {
    const { title, body, data, targetUserIds } = request.body;
    
    if (!title || !body) {
      response.status(400).json({ error: 'Title and body are required' });
      return;
    }
    
    const result = await sendPushNotificationToAll(title, body, data, targetUserIds);
    response.json(result);
    
  } catch (error) {
    logger.error('Error in sendNotification:', error);
    response.status(500).json({ error: 'Internal server error' });
  }
});

// Automatic notification when new task is created
exports.onTaskCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const task = event.data.data();
  const taskId = event.params.taskId;
  
  if (!task) return;
  
  try {
    const assignedUserIds = Array.isArray(task.assignedUserIds)
      ? task.assignedUserIds
      : task.assignedUserIds
        ? [task.assignedUserIds]
        : [];
    const observerIds = Array.isArray(task.observerIds) ? task.observerIds : [];
    let targetUserIds = [...new Set([...assignedUserIds, ...observerIds])];

    // If self-assigned and needs approval, notify department heads for approval
    const isSelfAssigned = assignedUserIds.includes(task.assignedById);
    if (task.needsApproval && isSelfAssigned) {
      const headIds = await getDepartmentHeadIds(task.departmentId);
      if (headIds.length) {
        targetUserIds = [...new Set([...targetUserIds, ...headIds])];
      }
    }

    if (targetUserIds.length === 0) {
      logger.info(`No target users for new task ${taskId}, skipping push`);
      return;
    }

    const title = 'New Task Assigned';
    const body = task.title || 'You have a new task';
    const data = {
      type: 'new_task',
      taskId: taskId,
      title: task.title || '',
      department: task.departmentId || 'Unknown'
    };
    
    await sendPushNotificationToAll(title, body, data, targetUserIds);
    logger.info(`Notification sent for new task: ${taskId}`);
    
  } catch (error) {
    logger.error(`Error sending notification for task ${taskId}:`, error);
  }
});

// Automatic notification when task status changes
exports.onTaskStatusChanged = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const taskId = event.params.taskId;
  
  if (!before || !after || before.status === after.status) return;
  
  try {
    let title, body, data;
    
    if (after.status === 'Complete') {
      title = 'Task Completed';
      body = `Task: ${after.title}`;
      data = {
        type: 'task_completed',
        taskId: taskId,
        title: after.title
      };
    } else if (after.status === 'Ongoing') {
      title = 'Task Started';
      body = `Task: ${after.title}`;
      data = {
        type: 'task_started',
        taskId: taskId,
        title: after.title
      };
    }
    
    if (title && body) {
      const assignedUserIds = Array.isArray(after.assignedUserIds)
        ? after.assignedUserIds
        : after.assignedUserIds
          ? [after.assignedUserIds]
          : [];
      const observerIds = Array.isArray(after.observerIds) ? after.observerIds : [];
      const targetUserIds = [...new Set([...assignedUserIds, ...observerIds])];

      if (targetUserIds.length === 0) {
        logger.info(`No target users for status change on task ${taskId}, skipping push`);
        return;
      }

      await sendPushNotificationToAll(title, body, data, targetUserIds);
      logger.info(`Status change notification sent for task: ${taskId}`);
    }
    
  } catch (error) {
    logger.error(`Error sending status change notification for task ${taskId}:`, error);
  }
});

// Automatic notification when material request is created
exports.onRequestCreated = onDocumentCreated('tasks/{taskId}', async (event) => {
  const task = event.data.data();
  const taskId = event.params.taskId;
  
  if (!task || !task.isRequest) return;
  
  try {
    const assignedUserIds = Array.isArray(task.assignedUserIds)
      ? task.assignedUserIds
      : task.assignedUserIds
        ? [task.assignedUserIds]
        : [];
    const observerIds = Array.isArray(task.observerIds) ? task.observerIds : [];
    const targetUserIds = [...new Set([...assignedUserIds, ...observerIds])];

    if (targetUserIds.length === 0) {
      logger.info(`No target users for material request ${taskId}, skipping push`);
      return;
    }

    const title = 'New Material Request';
    const body = `Request: ${task.title}`;
    const data = {
      type: 'material_request',
      taskId: taskId,
      title: task.title,
      requestingFor: task.requestingFor || 'Unknown'
    };
    
    await sendPushNotificationToAll(title, body, data, targetUserIds);
    logger.info(`Notification sent for material request: ${taskId}`);
    
  } catch (error) {
    logger.error(`Error sending notification for request ${taskId}:`, error);
  }
});

const SCHEDULED_WEEKDAY_INDEX = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTHLY_WEEK_INDEX = {
  first: 0,
  second: 1,
  third: 2,
  fourth: 3,
};

function normalizeScheduleDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
  }
  if (typeof value === 'string') {
    const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function getNthWeekdayOfMonth(year, monthIndex, weekdayName, weekdayOrder) {
  const targetDayIndex = SCHEDULED_WEEKDAY_INDEX[weekdayName];
  if (targetDayIndex === undefined) return null;

  if (weekdayOrder === 'last') {
    const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
    const offset = (lastDayOfMonth.getDay() - targetDayIndex + 7) % 7;
    return new Date(year, monthIndex, lastDayOfMonth.getDate() - offset);
  }

  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysUntilTarget = (targetDayIndex - firstDayOfMonth.getDay() + 7) % 7;
  const weekOffset = MONTHLY_WEEK_INDEX[weekdayOrder] ?? 0;
  const dayOfMonth = 1 + daysUntilTarget + (weekOffset * 7);
  const daysInMonth = getDaysInMonth(year, monthIndex);

  if (dayOfMonth > daysInMonth) return null;
  return new Date(year, monthIndex, dayOfMonth);
}

function getMonthlyOccurrenceForDate(recurrencePattern, year, monthIndex) {
  if (recurrencePattern.monthlyType === 'weekday') {
    return getNthWeekdayOfMonth(
      year,
      monthIndex,
      recurrencePattern.monthlyWeekdayName,
      recurrencePattern.monthlyWeekday
    );
  }

  const dayOfMonth = Math.max(1, recurrencePattern.monthlyDay || 1);
  const safeDay = Math.min(dayOfMonth, getDaysInMonth(year, monthIndex));
  return new Date(year, monthIndex, safeDay);
}

// Helper function to calculate next occurrence date based on recurrence pattern
function calculateNextOccurrence(recurrencePattern, lastOccurrence) {
  const lastDate = normalizeScheduleDate(lastOccurrence);
  if (!lastDate || !recurrencePattern) return null;

  const nextDate = new Date(lastDate);
  
  switch (recurrencePattern.type) {
    case 'daily':
      nextDate.setDate(lastDate.getDate() + Math.max(1, recurrencePattern.interval || 1));
      return nextDate;
    case 'weekly': {
      const weekdays = recurrencePattern.weekdays || ['monday'];
      const interval = Math.max(1, recurrencePattern.interval || 1);

      for (let i = 1; i <= 7 * interval; i += 1) {
        const candidate = new Date(lastDate);
        candidate.setDate(lastDate.getDate() + i);
        const weekdayName = Object.keys(SCHEDULED_WEEKDAY_INDEX).find(
          (key) => SCHEDULED_WEEKDAY_INDEX[key] === candidate.getDay()
        );
        if (weekdayName && weekdays.includes(weekdayName)) {
          return candidate;
        }
      }

      nextDate.setDate(lastDate.getDate() + (7 * interval));
      return nextDate;
    }
    case 'monthly': {
      if (recurrencePattern.monthlyType === 'regenerate') {
        return null;
      }

      const interval = Math.max(1, recurrencePattern.interval || 1);
      const candidateMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + interval, 1);
      return getMonthlyOccurrenceForDate(
        recurrencePattern,
        candidateMonth.getFullYear(),
        candidateMonth.getMonth()
      );
    }
    case 'yearly':
      nextDate.setFullYear(lastDate.getFullYear() + Math.max(1, recurrencePattern.interval || 1));
      return nextDate;
    default:
      return null;
  }
}

// Helper function to check if recurrence should end
function shouldEndRecurrence(recurrencePattern, occurrenceCount, currentDate) {
  if (!recurrencePattern.range) return false;
  
  switch (recurrencePattern.range.type) {
    case 'end_by':
      if (recurrencePattern.range.endDate) {
        return currentDate > new Date(recurrencePattern.range.endDate);
      }
      break;
    case 'end_after':
      if (recurrencePattern.range.occurrences) {
        return occurrenceCount >= recurrencePattern.range.occurrences;
      }
      break;
  }
  
  return false;
}

// HTTP function to process recurring tasks (replaces the scheduled function)
exports.processScheduledTasksHttp = onRequest(async (request, response) => {
  // Enhanced CORS support for in-app fetch calls
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.set('Access-Control-Max-Age', '3600');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const now = new Date();
  let processedCount = 0;
  
  try {
    // Get all scheduled tasks that need to be processed
    // First get all active scheduled tasks, then filter by date in memory to avoid compound index requirement
    const scheduledTasksSnapshot = await db.collection('scheduledTasks')
      .where('isActive', '==', true)
      .get();
    
    // Filter by nextOccurrence in memory
    const nowTimestamp = admin.firestore.Timestamp.fromDate(now);
    const tasksToProcess = scheduledTasksSnapshot.docs.filter(doc => {
      const task = doc.data();
      return task.nextOccurrence && task.nextOccurrence <= nowTimestamp;
    });
    
    if (tasksToProcess.length === 0) {
      logger.info('No scheduled tasks to process');
      response.json({ success: true, message: 'No scheduled tasks to process', processed: 0 });
      return;
    }
    
    logger.info(`Processing ${tasksToProcess.length} scheduled tasks`);
    
    const batch = db.batch();
    const tasksToCreate = [];
    
    for (const doc of tasksToProcess) {
      const scheduledTask = doc.data();
      const scheduledTaskId = doc.id;
      
      try {

        const nextOccurrenceDate = scheduledTask.nextOccurrence.toDate();
        const assignedUserIds = Array.isArray(scheduledTask.assignedUserIds)
          ? scheduledTask.assignedUserIds
          : scheduledTask.assignedUserIds
            ? [scheduledTask.assignedUserIds]
            : [];

        // Create the actual task
        const taskData = {
          title: scheduledTask.title,
          description: scheduledTask.description || '',
          assignedUserIds,
          observerIds: Array.isArray(scheduledTask.observerIds) ? scheduledTask.observerIds : [],
          assignedById: scheduledTask.assignedById,
          assignedByName: scheduledTask.assignedByName,
          departmentId: scheduledTask.departmentId,
          difficulty: scheduledTask.difficulty,
          points: scheduledTask.points,
          targetDate: nextOccurrenceDate.toISOString().split('T')[0],
          status: 'Pending',
          notes: scheduledTask.notes || [],
          photos: scheduledTask.photos || [],
          isUrgent: scheduledTask.isUrgent || false,
          isRdNewSkill: scheduledTask.isRdNewSkill || false,
          projectSkillName: scheduledTask.projectSkillName || '',
          isScheduled: false, // This is the actual task, not the schedule
          parentScheduledTaskId: scheduledTaskId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        // Add to batch for task creation
        const taskRef = db.collection('tasks').doc();
        batch.set(taskRef, taskData);
        tasksToCreate.push({
          id: taskRef.id,
          title: taskData.title,
          targetUserIds: [...new Set([...(taskData.assignedUserIds || []), ...(taskData.observerIds || [])])]
        });
        
        // Calculate next occurrence
        const nextOccurrence = calculateNextOccurrence(
          scheduledTask.recurrencePattern, 
          nextOccurrenceDate
        );

        if (nextOccurrence) {
          // Check if we should end the recurrence
          const shouldEnd = shouldEndRecurrence(
            scheduledTask.recurrencePattern,
            (scheduledTask.occurrenceCount || 0) + 1,
            nextOccurrence
          );
          
          if (shouldEnd) {
            // Mark scheduled task as inactive
            batch.update(doc.ref, {
              isActive: false,
              endedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            // Update next occurrence and increment count
            batch.update(doc.ref, {
              nextOccurrence: admin.firestore.Timestamp.fromDate(nextOccurrence),
              occurrenceCount: admin.firestore.FieldValue.increment(1),
              lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } else {
          if (
            scheduledTask.recurrencePattern?.type === 'monthly' &&
            scheduledTask.recurrencePattern?.monthlyType === 'regenerate'
          ) {
            // Regenerate schedules stay active and wait for the generated task to complete.
            batch.update(doc.ref, {
              nextOccurrence: null,
              occurrenceCount: admin.firestore.FieldValue.increment(1),
              lastProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
              endedAt: null,
            });
          } else {
            batch.update(doc.ref, {
              isActive: false,
              endedAt: admin.firestore.FieldValue.serverTimestamp(),
              lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
        
      } catch (error) {
        logger.error(`Error processing scheduled task ${scheduledTaskId}:`, error);
        // Mark as failed but don't stop processing others
        batch.update(doc.ref, {
          lastError: error.message,
          lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // Commit all changes
    await batch.commit();
    
    // Send notifications for created tasks
    for (const task of tasksToCreate) {
      try {
        const title = 'New Recurring Task';
        const body = `${task.title} (Recurring)`;
        const data = {
          type: 'recurring_task',
          taskId: task.id,
          title: task.title
        };
        
        await sendPushNotificationToAll(title, body, data, task.targetUserIds);
      } catch (error) {
        logger.error(`Error sending notification for recurring task ${task.id}:`, error);
      }
    }
    
    processedCount = tasksToCreate.length;
    logger.info(`Successfully processed ${processedCount} scheduled tasks`);

  } catch (error) {
    logger.error('Error processing scheduled tasks:', error);
    response.status(500).json({ error: 'Error processing scheduled tasks', message: error.message });
    return;
  }
  
  response.json({ success: true, message: 'Scheduled tasks processed successfully', processed: processedCount });
});

// Function to handle task completion for regenerate-type scheduled tasks
exports.onTaskCompleted = onDocumentUpdated('tasks/{taskId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const taskId = event.params.taskId;
  
  // Check if task was just completed and has a parent scheduled task
  if (before.status !== 'Complete' && after.status === 'Complete' && after.parentScheduledTaskId) {
    const db = admin.firestore();
    
    try {
      const scheduledTaskRef = db.collection('scheduledTasks').doc(after.parentScheduledTaskId);
      const scheduledTaskDoc = await scheduledTaskRef.get();
      
      if (!scheduledTaskDoc.exists) {
        logger.warn(`Parent scheduled task ${after.parentScheduledTaskId} not found`);
        return;
      }
      
      const scheduledTask = scheduledTaskDoc.data();
      
      // Check if this is a regenerate-type scheduled task
      if (scheduledTask.recurrencePattern?.type === 'monthly' && 
          scheduledTask.recurrencePattern?.monthlyType === 'regenerate') {
        
        const regenerateAfter = scheduledTask.recurrencePattern.regenerateAfter || 1;
        const nextOccurrence = new Date();
        nextOccurrence.setMonth(nextOccurrence.getMonth() + regenerateAfter);
        
        // Update the scheduled task with new next occurrence
        await scheduledTaskRef.update({
          isActive: true,
          nextOccurrence: admin.firestore.Timestamp.fromDate(nextOccurrence),
          lastProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
          endedAt: null
        });
        
        logger.info(`Updated regenerate scheduled task ${after.parentScheduledTaskId} for next occurrence`);
      }
      
    } catch (error) {
      logger.error(`Error handling task completion for scheduled task:`, error);
    }
  }
});

// Weekly Leaderboard Reset Functions
exports.weeklyLeaderboardReset = onSchedule({
  schedule: '0 0 * * 1', // Every Monday at midnight
  timeZone: 'Asia/Kolkata',
  memory: '1GB',
  timeoutSeconds: 540,
  region: 'asia-south1' // Use asia-south1 region for Cloud Scheduler
}, async (event) => {
  const db = admin.firestore();
  const logger = require('firebase-functions/logger');
  
  try {
    logger.info('Starting weekly leaderboard reset...');
    
    // Check if reset is needed
    const resetDoc = await db.collection('system').doc('weeklyReset').get();
    const lastReset = resetDoc.exists ? resetDoc.data().lastReset : null;
    
    if (lastReset) {
      const lastResetDate = lastReset.toDate();
      const oneWeekAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      
      if (lastResetDate > oneWeekAgo) {
        logger.info('Weekly reset not needed yet');
        return { success: true, message: 'Reset not needed' };
      }
    }
    
    // Get current week's data for archiving
    const usersSnapshot = await db.collection('users').get();
    const tasksSnapshot = await db.collection('tasks').get();
    
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate current week's rankings
    const currentWeekRankings = calculateCurrentWeekRankings(users, tasks);
    
    // Archive current week's data
    const weekStart = getStartOfWeek();
    const weekEnd = getEndOfWeek();
    
    const archiveData = {
      weekStart: admin.firestore.Timestamp.fromDate(weekStart),
      weekEnd: admin.firestore.Timestamp.fromDate(weekEnd),
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      rankings: currentWeekRankings.map((user, index) => ({
        userId: user.id,
        userName: user.name,
        executionPoints: user.executionPoints,
        leadershipPoints: user.leadershipPoints,
        bonusPoints: user.bonusPoints,
        tcs: user.tcs,
        completedTasks: user.completedTasks,
        departmentId: user.departmentId,
        rank: index + 1
      })),
      totalUsers: currentWeekRankings.length,
      topPerformer: currentWeekRankings[0] || null,
      topLeader: currentWeekRankings.find(u => u.leadershipPoints === Math.max(...currentWeekRankings.map(u => u.leadershipPoints))) || null
    };
    
    // Store archive
    await db.collection('weeklyLeaderboardArchives').add(archiveData);
    
    // Reset weekly scores for all users
    const batch = db.batch();
    const resetPromises = [];
    
    usersSnapshot.forEach(userDoc => {
      const userRef = db.collection('users').doc(userDoc.id);
      const userData = userDoc.data();
      
      // Store last week's rank before resetting
      const currentRank = currentWeekRankings.findIndex(u => u.id === userDoc.id) + 1;
      
      batch.update(userRef, {
        weeklyExecutionPoints: 0,
        weeklyLeadershipPoints: 0,
        weeklyBonusPoints: 0,
        weeklyTCS: 0,
        weeklyCompletedTasks: 0,
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp(),
        weeklyRank: null,
        weeklyRankLastWeek: currentRank || null
      });
    });
    
    // Commit the batch update
    await batch.commit();
    
    // Update the global reset timestamp
    const resetTimestampRef = db.collection('system').doc('weeklyReset');
    await resetTimestampRef.set({
      lastReset: admin.firestore.FieldValue.serverTimestamp(),
      resetCount: admin.firestore.FieldValue.increment(1),
      lastArchiveId: archiveData.archivedAt
    }, { merge: true });
    
    // Send notification to all users
    await sendPushNotificationToAll(
      '🏆 Weekly Leaderboard Reset!',
      'New week, new opportunities! Your weekly scores have been reset. Check the leaderboard to see last week\'s results.',
      { type: 'weekly_reset', weekStart: weekStart.toISOString() }
    );
    
    logger.info(`Weekly leaderboard reset completed. ${usersSnapshot.size} users reset.`);
    
    return { 
      success: true, 
      message: 'Weekly reset completed successfully',
      usersReset: usersSnapshot.size,
      archiveCreated: true
    };
    
  } catch (error) {
    logger.error('Error during weekly leaderboard reset:', error);
    return { success: false, error: error.message };
  }
});

// Manual weekly reset function for admins
exports.manualWeeklyReset = onRequest(async (request, response) => {
  // Enhanced CORS support
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  response.set('Access-Control-Max-Age', '3600');

  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const db = admin.firestore();
  const logger = require('firebase-functions/logger');
  
  try {
    // Verify admin access (you might want to add proper authentication here)
    const { adminUserId } = request.body;
    
    if (!adminUserId) {
      response.status(400).json({ error: 'Admin user ID required' });
      return;
    }
    
    // Check if user is admin
    const adminUser = await db.collection('users').doc(adminUserId).get();
    if (!adminUser.exists || adminUser.data().role !== 'Admin') {
      response.status(403).json({ error: 'Admin access required' });
      return;
    }
    
    logger.info(`Manual weekly reset initiated by admin: ${adminUserId}`);
    
    // Get current week's data for archiving
    const usersSnapshot = await db.collection('users').get();
    const tasksSnapshot = await db.collection('tasks').get();
    
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate current week's rankings
    const currentWeekRankings = calculateCurrentWeekRankings(users, tasks);
    
    // Archive current week's data
    const weekStart = getStartOfWeek();
    const weekEnd = getEndOfWeek();
    
    const archiveData = {
      weekStart: admin.firestore.Timestamp.fromDate(weekStart),
      weekEnd: admin.firestore.Timestamp.fromDate(weekEnd),
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      rankings: currentWeekRankings.map((user, index) => ({
        userId: user.id,
        userName: user.name,
        executionPoints: user.executionPoints,
        leadershipPoints: user.leadershipPoints,
        bonusPoints: user.bonusPoints,
        tcs: user.tcs,
        completedTasks: user.completedTasks,
        departmentId: user.departmentId,
        rank: index + 1
      })),
      totalUsers: currentWeekRankings.length,
      topPerformer: currentWeekRankings[0] || null,
      topLeader: currentWeekRankings.find(u => u.leadershipPoints === Math.max(...currentWeekRankings.map(u => u.leadershipPoints))) || null,
      manualReset: true,
      resetBy: adminUserId
    };
    
    // Store archive
    const archiveRef = await db.collection('weeklyLeaderboardArchives').add(archiveData);
    
    // Reset weekly scores for all users
    const batch = db.batch();
    
    usersSnapshot.forEach(userDoc => {
      const userRef = db.collection('users').doc(userDoc.id);
      const currentRank = currentWeekRankings.findIndex(u => u.id === userDoc.id) + 1;
      
      batch.update(userRef, {
        weeklyExecutionPoints: 0,
        weeklyLeadershipPoints: 0,
        weeklyBonusPoints: 0,
        weeklyTCS: 0,
        weeklyCompletedTasks: 0,
        lastWeeklyReset: admin.firestore.FieldValue.serverTimestamp(),
        weeklyRank: null,
        weeklyRankLastWeek: currentRank || null
      });
    });
    
    // Commit the batch update
    await batch.commit();
    
    // Update the global reset timestamp
    const resetTimestampRef = db.collection('system').doc('weeklyReset');
    await resetTimestampRef.set({
      lastReset: admin.firestore.FieldValue.serverTimestamp(),
      resetCount: admin.firestore.FieldValue.increment(1),
      lastArchiveId: archiveRef.id,
      lastManualReset: admin.firestore.FieldValue.serverTimestamp(),
      lastManualResetBy: adminUserId
    }, { merge: true });
    
    // Send notification to all users
    await sendPushNotificationToAll(
      '🏆 Weekly Leaderboard Reset!',
      'Admin has reset the weekly leaderboard. New week, new opportunities!',
      { type: 'manual_weekly_reset', weekStart: weekStart.toISOString() }
    );
    
    logger.info(`Manual weekly reset completed by admin ${adminUserId}. ${usersSnapshot.size} users reset.`);
    
    response.json({ 
      success: true, 
      message: 'Weekly reset completed successfully',
      usersReset: usersSnapshot.size,
      archiveId: archiveRef.id
    });
    
  } catch (error) {
    logger.error('Error during manual weekly reset:', error);
    response.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions for weekly reset
function getStartOfWeek() {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);
  return startOfWeek;
}

function getEndOfWeek() {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return endOfWeek;
}

function calculateCurrentWeekRankings(users, tasks) {
  const startOfWeek = getStartOfWeek();
  const endOfWeek = getEndOfWeek();
  
  return users.map(user => {
    const userTasks = tasks.filter(task => {
      return task.assignedUserIds &&
             Array.isArray(task.assignedUserIds) &&
             task.assignedUserIds.includes(user.id) &&
             task.status === 'Complete';
    });

    const userBonusLedger = user?.dailyBonusLedger || {};
    
    // Calculate weekly Execution Points (EP)
    const weeklyTasks = userTasks.filter(task => {
      const completionDate = getTaskCompletionDate(task);
      return completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek;
    });
    const weeklyExecutionPoints = weeklyTasks.reduce((total, task) => total + calculateTaskPoints(task), 0);
    
    // Calculate weekly Leadership Points (LP)
    const weeklyLeadershipData = calculateWeeklyLeadershipPoints(tasks, user.id, startOfWeek, endOfWeek);
    const weeklyLeadershipPoints = weeklyLeadershipData.total;
    
    // Calculate weekly bonus points
    const weeklyBonusPoints = getBonusPointsInRange(userBonusLedger, startOfWeek, endOfWeek);
    
    // Calculate weekly TCS
    const weeklyTCS = weeklyExecutionPoints + weeklyLeadershipPoints + weeklyBonusPoints;

    return {
      id: user.id,
      name: user.name || 'Unknown',
      executionPoints: weeklyExecutionPoints,
      leadershipPoints: weeklyLeadershipPoints,
      bonusPoints: weeklyBonusPoints,
      tcs: weeklyTCS,
      completedTasks: weeklyTasks.length,
      departmentId: user.departmentIds?.[0] || null,
    };
  }).sort((a, b) => b.tcs - a.tcs);
}

function getTaskCompletionDate(task) {
  if (!task.completedAt) return null;
  
  if (task.completedAt.toDate) {
    return task.completedAt.toDate();
  } else if (task.completedAt instanceof Date) {
    return task.completedAt;
  } else if (typeof task.completedAt === 'string') {
    return new Date(task.completedAt);
  }
  
  return null;
}

function calculateTaskPoints(task) {
  const difficultyPoints = {
    'Easy': 10,
    'Medium': 25,
    'Hard': 50,
    'Critical': 100
  };
  
  let points = difficultyPoints[task.difficulty] || 0;
  
  // Team collaboration bonus
  if (task.assignedUserIds && task.assignedUserIds.length > 1) {
    points = Math.round(points * 1.1);
  }
  
  // Urgent task bonus
  if (task.isUrgent) {
    points = Math.round(points * 1.25);
  }
  
  // On-time completion bonus
  if (task.targetDate && task.completedAt) {
    const targetDate = task.targetDate.toDate ? task.targetDate.toDate() : new Date(task.targetDate);
    const completedDate = getTaskCompletionDate(task);
    
    if (completedDate && completedDate <= targetDate) {
      points += 3;
    }
  }
  
  return points;
}

function calculateWeeklyLeadershipPoints(tasks, managerId, startOfWeek, endOfWeek) {
  const managerTasks = tasks.filter(task => 
    task.assignedById === managerId && 
    task.status === 'Complete'
  );

  let totalLP = 0;
  let tasksAwarded = 0;

  managerTasks.forEach(task => {
    const completionDate = getTaskCompletionDate(task);
    if (completionDate && completionDate >= startOfWeek && completionDate <= endOfWeek) {
      const taskPoints = calculateTaskPoints(task);
      const lpData = calculateLeadershipPoints(task, taskPoints);
      totalLP += lpData.total;
      tasksAwarded++;
    }
  });

  return {
    total: totalLP,
    tasksAwarded
  };
}

function calculateLeadershipPoints(task, taskExecutionPoints) {
  if (!task || !taskExecutionPoints) {
    return { completionBonus: 0, difficultyFairness: 0, onTimeBonus: 0, total: 0 };
  }

  let completionBonus = 0;
  let difficultyFairness = 0;
  let onTimeBonus = 0;

  const isRdNewSkill = task.isRdNewSkill || false;

  // Completion Bonus
  if (isRdNewSkill) {
    completionBonus = Math.round(taskExecutionPoints * 0.50);
  } else {
    completionBonus = Math.round(taskExecutionPoints * 0.20);
  }

  // Difficulty Fairness (only for regular tasks)
  if (!isRdNewSkill) {
    difficultyFairness = Math.round(taskExecutionPoints * 0.05);
  }

  // On-Time Delivery Bonus
  if (task.targetDate && task.completedAt) {
    const targetDate = task.targetDate.toDate ? task.targetDate.toDate() : new Date(task.targetDate);
    const completedDate = getTaskCompletionDate(task);
    
    if (completedDate && completedDate <= targetDate) {
      onTimeBonus = Math.round(taskExecutionPoints * 0.05);
    }
  }

  return {
    completionBonus,
    difficultyFairness,
    onTimeBonus,
    total: completionBonus + difficultyFairness + onTimeBonus
  };
}

function getBonusPointsInRange(bonusLedger, startDate, endDate) {
  let total = 0;
  
  Object.values(bonusLedger).forEach(entry => {
    if (entry.date && entry.points) {
      const entryDate = entry.date.toDate ? entry.date.toDate() : new Date(entry.date);
      if (entryDate >= startDate && entryDate <= endDate) {
        total += entry.points;
      }
    }
  });
  
  return total;
}

exports.getPWAAnalytics = onCall({
  region: 'asia-south1',
  memory: '1GB',
  timeoutSeconds: 120,
}, async (request) => {
  const { startDate, endDate, userIds } = request.data;
  
  if (!startDate || !endDate) {
    throw new HttpsError('invalid-argument', 'The function must be called with "startDate" and "endDate" arguments.');
  }

  const db = admin.firestore();
  const analyticsProcessor = new PWAAnalyticsProcessor(db);
  
  try {
    const analyticsData = await analyticsProcessor.getAnalyticsData(startDate, endDate, userIds);
    return analyticsData;
  } catch (error) {
    logger.error('Error fetching PWA analytics:', error);
    throw new HttpsError('internal', 'Failed to fetch PWA analytics data.', error.message);
  }
});


