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
const {onObjectFinalized} = require("firebase-functions/v2/storage");
const {onDocumentCreated, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const csvParser = require('csv-parser');

// Initialize Firebase Admin
admin.initializeApp();

// For cost control and region alignment with Firestore (asia-south2)
setGlobalOptions({ maxInstances: 10, region: 'asia-south2' });

// Function to send push notifications to all users
async function sendPushNotificationToAll(title, body, data = {}) {
  try {
    const db = admin.firestore();
    
    // Get all users with FCM tokens
    const usersSnapshot = await db.collection('users').get();
    const tokens = [];
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
        tokens.push(...userData.fcmTokens);
      }
    });
    
    if (tokens.length === 0) {
      logger.info('No FCM tokens found');
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
    const { title, body, data } = request.body;
    
    if (!title || !body) {
      response.status(400).json({ error: 'Title and body are required' });
      return;
    }
    
    const result = await sendPushNotificationToAll(title, body, data);
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
    const title = 'New Task Assigned';
    const body = task.title || 'You have a new task';
    const data = {
      type: 'new_task',
      taskId: taskId,
      title: task.title || '',
      department: task.departmentId || 'Unknown'
    };
    
    await sendPushNotificationToAll(title, body, data);
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
      await sendPushNotificationToAll(title, body, data);
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
    const title = 'New Material Request';
    const body = `Request: ${task.title}`;
    const data = {
      type: 'material_request',
      taskId: taskId,
      title: task.title,
      requestingFor: task.requestingFor || 'Unknown'
    };
    
    await sendPushNotificationToAll(title, body, data);
    logger.info(`Notification sent for material request: ${taskId}`);
    
  } catch (error) {
    logger.error(`Error sending notification for request ${taskId}:`, error);
  }
});

// Helper function to calculate next occurrence date based on recurrence pattern
function calculateNextOccurrence(recurrencePattern, lastOccurrence) {
  const lastDate = new Date(lastOccurrence);
  const nextDate = new Date(lastDate);
  
  switch (recurrencePattern.type) {
    case 'daily':
      nextDate.setDate(lastDate.getDate() + recurrencePattern.interval);
      break;
      
    case 'weekly':
      // Find next occurrence of selected weekdays
      const weekdays = recurrencePattern.weekdays || ['monday'];
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      
      let daysToAdd = 0;
      let found = false;
      
      for (let i = 1; i <= 7 * recurrencePattern.interval; i++) {
        const checkDate = new Date(lastDate);
        checkDate.setDate(lastDate.getDate() + i);
        const dayName = dayNames[checkDate.getDay()];
        
        if (weekdays.includes(dayName)) {
          daysToAdd = i;
          found = true;
          break;
        }
      }
      
      if (!found) {
        // If no weekday found in the interval, go to next week
        nextDate.setDate(lastDate.getDate() + (7 * recurrencePattern.interval));
      } else {
        nextDate.setDate(lastDate.getDate() + daysToAdd);
      }
      break;
      
    case 'monthly':
      if (recurrencePattern.monthlyType === 'day') {
        nextDate.setMonth(lastDate.getMonth() + recurrencePattern.interval);
        // Handle day overflow (e.g., Jan 31 -> Feb 28/29)
        const targetDay = recurrencePattern.monthlyDay;
        const daysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
        nextDate.setDate(Math.min(targetDay, daysInMonth));
      } else if (recurrencePattern.monthlyType === 'weekday') {
        nextDate.setMonth(lastDate.getMonth() + recurrencePattern.interval);
        // Find the nth weekday of the month
        const weekOptions = ['first', 'second', 'third', 'fourth', 'last'];
        const weekIndex = weekOptions.indexOf(recurrencePattern.monthlyWeekday);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDayName = recurrencePattern.monthlyWeekdayName;
        const targetDayIndex = dayNames.indexOf(targetDayName);
        
        // Set to first day of month
        nextDate.setDate(1);
        
        // Find first occurrence of target weekday
        while (nextDate.getDay() !== targetDayIndex) {
          nextDate.setDate(nextDate.getDate() + 1);
        }
        
        // Add weeks based on weekIndex
        if (weekIndex === 4) { // last
          // Go to last week of month
          const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0);
          const lastWeekStart = new Date(lastDay);
          lastWeekStart.setDate(lastDay.getDate() - lastDay.getDay() + targetDayIndex);
          if (lastWeekStart.getMonth() === nextDate.getMonth()) {
            nextDate.setTime(lastWeekStart.getTime());
          }
        } else {
          nextDate.setDate(nextDate.getDate() + (weekIndex * 7));
        }
      } else if (recurrencePattern.monthlyType === 'regenerate') {
        // For regenerate, we don't calculate next occurrence here
        // It will be handled when the task is completed
        return null;
      }
      break;
      
    case 'yearly':
      nextDate.setFullYear(lastDate.getFullYear() + recurrencePattern.interval);
      break;
      
    default:
      return null;
  }
  
  return nextDate;
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
          assignedUserIds: taskData.assignedUserIds
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
          // No next occurrence (e.g., regenerate type), mark as inactive
          batch.update(doc.ref, {
            isActive: false,
            endedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
          });
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
        
        await sendPushNotificationToAll(title, body, data);
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
          nextOccurrence: admin.firestore.Timestamp.fromDate(nextOccurrence),
          occurrenceCount: admin.firestore.FieldValue.increment(1),
          lastProcessedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        logger.info(`Updated regenerate scheduled task ${after.parentScheduledTaskId} for next occurrence`);
      }
      
    } catch (error) {
      logger.error(`Error handling task completion for scheduled task:`, error);
    }
  }
});

// Storage-triggered CSV import for large attendance files
// Upload to gs://<bucket>/attendance_imports/<any>.csv
exports.importAttendanceCsv = onObjectFinalized({ bucket: process.env.FUNCTIONS_EMULATOR ? undefined : undefined }, async (event) => {
  const file = event.data;
  const bucketName = file.bucket;
  const name = file.name || '';

  try {
    // Only process files under attendance_imports/ and ending with .csv
    if (!name.startsWith('attendance_imports/') || !name.toLowerCase().endsWith('.csv')) {
      logger.info(`Skipping non-attendance file: ${name}`);
      return;
    }

    const storage = admin.storage().bucket(bucketName);
    const db = admin.firestore();
    const bulkWriter = db.bulkWriter();
    let processed = 0;
    let skipped = 0;

    await new Promise((resolve, reject) => {
      storage.file(name)
        .createReadStream()
        .on('error', (err) => reject(err))
        .pipe(csvParser())
        .on('data', (row) => {
          try {
            // Normalize headers similar to UI importer
            const employeeId = String(
              row['imp_id'] || row['IMP. ID'] || row['EMP ID'] || row['EMPID'] || row['employeeId'] || row['Employee ID'] || row['Emp Id'] || row['EmpID'] || ''
            ).trim();
            const dateRaw = row['date'] || row['Date'] || row['DATE'] || '';
            const inTime = String(row['in_time'] || row['In time'] || row['In Time'] || row['INTIME'] || row['IN'] || row['inTime'] || '').trim();
            const outTime = String(row['out_time'] || row['Out time'] || row['Out Time'] || row['OUTTIME'] || row['OUT'] || row['outTime'] || '').trim();
            const ot = row['ot_time'] || row['OT hours'] || row['OT Hours'] || row['OT'] || row['Overtime'] || row['otHours'] || '';

            const toIsoDate = (x) => {
              if (!x) return '';
              const s = String(x).trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
              let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
              if (m) {
                const d = m[1].padStart(2, '0');
                const mo = m[2].padStart(2, '0');
                const y = m[3].length === 2 ? `20${m[3]}` : m[3];
                return `${y}-${mo}-${d}`;
              }
              m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
              if (m) {
                const d = m[1].padStart(2, '0');
                const mo = m[2].padStart(2, '0');
                const y = m[3].length === 2 ? `20${m[3]}` : m[3];
                return `${y}-${mo}-${d}`;
              }
              return s;
            };

            const parseOt = (x) => {
              if (typeof x === 'number') return x;
              const s = String(x || '').trim();
              if (!s) return 0;
              const tm = s.match(/^(\d+):(\d+)$/);
              if (tm) {
                const h = parseInt(tm[1]);
                const mi = parseInt(tm[2]);
                return h + (mi / 60);
              }
              const num = parseFloat(s.replace(',', '.'));
              return isNaN(num) ? 0 : num;
            };

            const date = toIsoDate(dateRaw);
            if (!employeeId || !date) { skipped++; return; }

            const docId = `${employeeId}_${date}`;
            const ref = db.collection('attendance').doc(docId);
            bulkWriter.set(ref, {
              employeeId,
              date,
              inTime,
              outTime,
              otHours: parseOt(ot)
            }, { merge: true });
            processed++;
          } catch (e) {
            skipped++;
          }
        })
        .on('end', async () => {
          try {
            await bulkWriter.close();
            logger.info(`Attendance CSV imported: ${processed} processed, ${skipped} skipped (${name})`);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
    });

    // Optionally move file to processed/ folder
    const dest = name.replace('attendance_imports/', 'attendance_imports/processed/');
    await admin.storage().bucket(bucketName).file(name).move(dest);
    logger.info(`Moved imported file to ${dest}`);

  } catch (error) {
    logger.error('Error importing attendance CSV:', error);
    throw error;
  }
});
