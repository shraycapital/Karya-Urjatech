// ⚠️ CRITICAL: All dates in this app use Firestore timestamp format
// Format: { seconds: number, nanoseconds: number }
// See FIRESTORE_TIMESTAMP_GUIDE.md for complete documentation

import { db } from '../../../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp, getDocs, getDoc, Timestamp } from 'firebase/firestore';
import { toISTISOString } from '../../../shared/utils/date';
import { logTaskActivity, logActivity } from '../../../shared/utils/activityLogger';
import { cleanFirestoreData } from '../../../shared/utils/firestoreHelpers';

const TASKS_COLLECTION = 'tasks'; // Primary collection
const TASKS_COLLECTION_UPPER = 'Tasks'; // Backup collection

// Helper function to get the primary collection
const getPrimaryCollection = () => collection(db, TASKS_COLLECTION);

// Helper function to get the backup collection
const getBackupCollection = () => collection(db, TASKS_COLLECTION_UPPER);

// Helper to resolve which collection a task lives in (tasks vs Tasks).
// Many deployments historically wrote to `Tasks` (uppercase) and the app now reads from both.
const resolveTaskDocRef = async (taskId) => {
  const primaryRef = doc(getPrimaryCollection(), taskId);
  const backupRef = doc(getBackupCollection(), taskId);

  try {
    const primarySnap = await getDoc(primaryRef);
    if (primarySnap.exists()) return { ref: primaryRef, snap: primarySnap, source: TASKS_COLLECTION };
  } catch (error) {
    // Ignore and fall back to backup.
  }

  try {
    const backupSnap = await getDoc(backupRef);
    if (backupSnap.exists()) return { ref: backupRef, snap: backupSnap, source: TASKS_COLLECTION_UPPER };
  } catch (error) {
    // Ignore and fall back to primary as default.
  }

  return { ref: primaryRef, snap: null, source: 'unknown' };
};

export const subscribeTasks = (onChange, options = {}) => {
  const { progressive = true, loadHeavyItems = false } = options;
  
  let currentPrimary = [];
  let currentBackup = [];
  const emit = () => {
    const map = new Map();
    currentBackup.forEach(t => map.set(t.id, t));
    currentPrimary.forEach(t => map.set(t.id, t)); // prefer primary
    
    // If progressive loading is enabled, strip heavy items from initial load
    const tasks = Array.from(map.values()).map(task => {
      if (progressive && !loadHeavyItems) {
        // Keep only the latest note for fast initial rendering (avoids showing stale "first note"
        // and prevents leaking `[undefined]` into the UI when notes is an empty array).
        const latestNote =
          Array.isArray(task.notes) && task.notes.length > 0
            ? task.notes[task.notes.length - 1]
            : null;

        return {
          ...task,
          // Keep basic info for fast loading
          photos: [], // Empty array for photos initially
          comments: [], // Empty array for comments initially
          notes: latestNote ? [latestNote] : [],
          _progressiveLoaded: false // Flag to track progressive loading state
        };
      }
      return { ...task, _progressiveLoaded: true };
    });
    
    onChange(tasks);
  };

  (async () => {
    try {
      const [primarySnap, backupSnap] = await Promise.all([
        getDocs(getPrimaryCollection()).catch(() => ({ docs: [] })),
        getDocs(getBackupCollection()).catch(() => ({ docs: [] }))
      ]);
      currentPrimary = primarySnap.docs.map(d => ({ id: d.id, ...d.data() }));
      currentBackup = backupSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      emit();
    } catch {
      onChange([]);
    }
  })();

  const unsub1 = onSnapshot(getPrimaryCollection(), (snap) => {
    currentPrimary = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  }, (error) => {
    console.warn('Primary collection listener error:', error);
    // Don't emit on error to avoid clearing data
  });
  
  const unsub2 = onSnapshot(getBackupCollection(), (snap) => {
    currentBackup = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    emit();
  }, (error) => {
    console.warn('Backup collection listener error:', error);
    // Don't emit on error to avoid clearing data
  });

  return () => { unsub1(); unsub2(); };
};

// Function to load heavy items (photos, full notes, comments) for specific tasks
export const loadTaskHeavyItems = async (taskIds) => {
  if (!Array.isArray(taskIds) || taskIds.length === 0) return [];
  
  try {
    const tasksWithHeavyItems = [];
    
    for (const taskId of taskIds) {
      // Try primary collection first
      let taskDoc = null;
      try {
        const primaryDoc = await getDoc(doc(db, TASKS_COLLECTION, taskId));
        if (primaryDoc.exists()) {
          taskDoc = primaryDoc;
        }
      } catch (error) {
        console.log('Primary collection fetch failed for task:', taskId);
      }
      
      // Try backup collection if primary failed
      if (!taskDoc) {
        try {
          const backupDoc = await getDoc(doc(db, TASKS_COLLECTION_UPPER, taskId));
          if (backupDoc.exists()) {
            taskDoc = backupDoc;
          }
        } catch (error) {
          console.log('Backup collection fetch failed for task:', taskId);
        }
      }
      
      if (taskDoc) {
        const taskData = taskDoc.data();
        tasksWithHeavyItems.push({
          id: taskId,
          photos: taskData.photos || [],
          comments: taskData.comments || [],
          notes: taskData.notes || [],
          _progressiveLoaded: true
        });
      }
    }
    
    return tasksWithHeavyItems;
  } catch (error) {
    console.error('Error loading heavy items for tasks:', error);
    return [];
  }
};

export const createTask = async (taskData, currentUserId, currentUserName) => {
  // Robust check: Ensure we have a valid user ID and name before creating a task.
  if (!currentUserId || !currentUserName || currentUserName === 'Unknown') {
    console.error('Task creation blocked: Missing user ID or name.', { currentUserId, currentUserName });
    throw new Error('A valid user ID and name are required to create a task.');
  }

  if (!taskData?.title || !taskData?.departmentId || !Array.isArray(taskData.assignedUserIds) || taskData.assignedUserIds.length === 0) {
    throw new Error('Missing required fields: title, departmentId, assignedUserIds');
  }
  
  // Check if user is assigning task to themselves (self-assignment)
  // This includes cases where they assign to themselves AND others
  const isSelfAssigned = taskData.assignedUserIds.includes(currentUserId);
  
  // Get user role to determine if approval is needed
  // Heads, Management, and Admins don't need approval for their self-assigned tasks
  const needsApproval = isSelfAssigned && 
    taskData.assignedUserRole !== 'Head' && 
    taskData.assignedUserRole !== 'Management' && 
    taskData.assignedUserRole !== 'Admin';
  
  const payload = {
    ...taskData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedById: currentUserId,
    assignedById: currentUserId,
    assignedByName: currentUserName,
    originalAssignedById: currentUserId,
    originalAssignedByName: currentUserName,
    startedAt: taskData.startedAt || null,
    completedAt: taskData.completedAt || null,
    notes: taskData.notes || [],
    photos: taskData.photos || [],
    notifiedUsers: taskData.notifiedUsers || [],
    status: taskData.status || 'Pending',
    assignedUserIds: taskData.assignedUserIds || [],
    isUrgent: taskData.isUrgent || false,
    targetDate: taskData.targetDate || null,
    type: taskData.type || null,
    originalTaskId: taskData.originalTaskId || null,
    originalTaskTitle: taskData.originalTaskTitle || null,
    requestingDepartmentId: taskData.requestingDepartmentId || null,
    requestingUserId: taskData.requestingUserId || null,
    requestingUserName: taskData.requestingUserName || null,
    isBlocking: taskData.isBlocking || false,
    originalAssignedUsers: taskData.originalAssignedUsers || [],
    difficulty: taskData.difficulty || null,
    points: taskData.points || null,
    // Self-assigned tasks need approval from department heads (except for Heads, Management, Admins)
    needsApproval: needsApproval,
    approvedBy: null,
    approvedAt: null,
    approvedByName: null,
  };
  const res = await addDoc(getPrimaryCollection(), payload);
  
  // Log task creation activity
  try {
    await logTaskActivity('create', { ...payload, id: res.id }, currentUserId, currentUserName, {
      assignedUserCount: taskData.assignedUserIds?.length || 0,
      isUrgent: taskData.isUrgent || false,
      hasTargetDate: !!taskData.targetDate,
      taskType: taskData.type || 'regular'
    });
  } catch (error) {
    console.warn('Failed to log task creation activity:', error);
  }
  
  return res.id;
};

export const patchTask = async (taskId, updates = {}, currentUserId, currentUserName = 'Unknown') => {
  // Get the current task data for logging
  let currentTask = null;
  let targetRef = doc(getPrimaryCollection(), taskId);
  try {
    const resolved = await resolveTaskDocRef(taskId);
    if (resolved?.ref) targetRef = resolved.ref;
    if (resolved?.snap?.exists?.()) {
      currentTask = { id: resolved.snap.id, ...resolved.snap.data() };
    }
  } catch (error) {
    console.warn('Failed to resolve task document for update/logging:', error);
  }

  // Resolve user identity defensively
  const effectiveUserId = currentUserId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kartavya_userId') : null) || 'system';
  const effectiveUserName = currentUserName || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kartavya_userName') || 'Unknown') : 'Unknown');

  // Clean undefined values from updates
  const cleanUpdates = cleanFirestoreData(updates);
  
  // The document ID should not be in the update payload
  if (cleanUpdates.id) {
    delete cleanUpdates.id;
  }

  const data = { ...cleanUpdates, updatedAt: serverTimestamp(), updatedById: effectiveUserId };
  if (updates.status === 'Ongoing' && !updates.startedAt) data.startedAt = serverTimestamp();
  if (updates.status === 'Complete' && !updates.completedAt) data.completedAt = serverTimestamp();
  if (updates.status === 'Pending') {
    data.startedAt = null;
    data.completedAt = null;
  }
  // If assignment changed, stamp assignedBy as the actor performing the change
  // But preserve the original assignedBy fields
  if (Object.prototype.hasOwnProperty.call(cleanUpdates, 'assignedUserIds')) {
    data.assignedById = effectiveUserId;
    data.assignedByName = effectiveUserName;
    // Don't update originalAssignedById and originalAssignedByName - they should remain unchanged
  }
  
  // Clean the final data object before sending to Firestore
  const finalData = cleanFirestoreData(data);
  try {
    await updateDoc(targetRef, finalData);
  } catch (error) {
    // Common legacy case: task exists in `Tasks` but not `tasks` (or vice-versa).
    // If we get a not-found error, try the other collection before failing.
    if (error?.code === 'not-found') {
      const primaryRef = doc(getPrimaryCollection(), taskId);
      const backupRef = doc(getBackupCollection(), taskId);
      const fallbackRef = (targetRef?.path === primaryRef.path) ? backupRef : primaryRef;
      await updateDoc(fallbackRef, finalData);
    } else {
      throw error;
    }
  }
  
  // Log task update activity
  if (currentTask) {
    try {
      const action = cleanUpdates.status ? 
        (cleanUpdates.status === 'Ongoing' ? 'start' : 
         cleanUpdates.status === 'Complete' ? 'complete' : 
         cleanUpdates.status === 'Pending' ? 'reopen' : 'update') : 'update';
      
      await logTaskActivity(action, currentTask, effectiveUserId, effectiveUserName, {
        changes: Object.keys(cleanUpdates),
        previousStatus: currentTask.status,
        newStatus: cleanUpdates.status || currentTask.status,
        previousValues: currentTask,
        newValues: cleanUpdates
      });
    } catch (error) {
      console.warn('Failed to log task update activity:', error);
    }
  }
};

export const removeTask = async (taskId, currentUserId = 'system', currentUserName = 'System', deleteReason = 'No reason provided') => {
  if (deleteReason === undefined || deleteReason === null) {
    deleteReason = 'No reason provided';
  }

  // Get the current task data for logging
  let currentTask = null;
  try {
    const resolved = await resolveTaskDocRef(taskId);
    if (resolved?.snap?.exists?.()) {
      currentTask = { id: resolved.snap.id, ...resolved.snap.data() };
    }
  } catch (error) {
    console.warn('Failed to get current task for logging:', error);
  }

  // Instead of deleting, mark as deleted with reason
  if (currentTask) {
    const deletedAt = new Date();
    const deleteNote = `Task deleted on ${deletedAt.toLocaleDateString()} at ${deletedAt.toLocaleTimeString()} by ${currentUserName}. Reason: ${deleteReason}`;

    // Add the deletion note to existing notes array
    const existingNotes = Array.isArray(currentTask.notes) ? currentTask.notes : [];
    const updatedNotes = [
      ...existingNotes,
      {
        text: deleteNote,
        type: 'deletion',
        timestamp: new Date().toISOString(),
        userId: currentUserId,
        userName: currentUserName
      }
    ];

    // Update the task with deleted status and reason
    const updateData = {
      status: 'Deleted',
      deletedAt: serverTimestamp(),
      deletedBy: currentUserId,
      deletedByName: currentUserName,
      deleteReason: deleteReason,
      notes: updatedNotes
    };

    // Clean the update data before sending to Firestore
    const cleanUpdateData = cleanFirestoreData(updateData);
    // Update the correct collection (tasks vs Tasks) for legacy compatibility.
    const resolved = await resolveTaskDocRef(taskId);
    const targetRef = resolved?.ref || doc(getPrimaryCollection(), taskId);
    try {
      await updateDoc(targetRef, cleanUpdateData);
    } catch (error) {
      if (error?.code === 'not-found') {
        const primaryRef = doc(getPrimaryCollection(), taskId);
        const backupRef = doc(getBackupCollection(), taskId);
        const fallbackRef = (targetRef?.path === primaryRef.path) ? backupRef : primaryRef;
        await updateDoc(fallbackRef, cleanUpdateData);
      } else {
        throw error;
      }
    }

    console.debug('Task delete update payload', { taskId, updateData });

    // Log task deletion activity
    try {
      await logTaskActivity('soft_delete', currentTask, currentUserId, currentUserName, {
        taskStatus: currentTask.status,
        taskDifficulty: currentTask.difficulty,
        taskPoints: currentTask.points,
        assignedUserCount: currentTask.assignedUserIds?.length || 0,
        deleteReason: deleteReason
      });
    } catch (error) {
      console.warn('Failed to log task deletion activity:', error);
    }
  }
};

export const getTask = async (taskId) => {
  // Try primary collection first, then fallback to legacy `Tasks`.
  try {
    const resolved = await resolveTaskDocRef(taskId);
    if (resolved?.snap?.exists?.()) {
      return { id: resolved.snap.id, ...resolved.snap.data() };
    }
    return null;
  } catch (error) {
    console.warn('Failed to load task:', error);
    return null;
  }
};

// Scheduled Tasks API Functions
const SCHEDULED_TASKS_COLLECTION = 'scheduledTasks';

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

const normalizeScheduleDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value);
  }
  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }
  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
  }
  if (typeof value === 'string') {
    const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
    const parsed = new Date(normalizedValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const getDaysInMonth = (year, monthIndex) => {
  return new Date(year, monthIndex + 1, 0).getDate();
};

const getNthWeekdayOfMonth = (year, monthIndex, weekdayName, weekdayOrder) => {
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

  if (dayOfMonth > daysInMonth) {
    return null;
  }

  return new Date(year, monthIndex, dayOfMonth);
};

const getMonthlyOccurrenceForDate = (recurrencePattern, year, monthIndex) => {
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
};

const calculateFirstScheduledOccurrence = (recurrencePattern, startDate) => {
  const normalizedStartDate = normalizeScheduleDate(startDate);
  if (!normalizedStartDate || !recurrencePattern) return null;

  const firstOccurrence = new Date(normalizedStartDate);

  switch (recurrencePattern.type) {
    case 'weekly': {
      const weekdays = recurrencePattern.weekdays || [];
      if (!weekdays.length) {
        return firstOccurrence;
      }

      for (let i = 0; i <= 7 * Math.max(1, recurrencePattern.interval || 1); i += 1) {
        const candidate = new Date(normalizedStartDate);
        candidate.setDate(normalizedStartDate.getDate() + i);
        const weekdayName = Object.keys(SCHEDULED_WEEKDAY_INDEX).find(
          (key) => SCHEDULED_WEEKDAY_INDEX[key] === candidate.getDay()
        );
        if (weekdayName && weekdays.includes(weekdayName)) {
          return candidate;
        }
      }
      return firstOccurrence;
    }
    case 'monthly': {
      if (recurrencePattern.monthlyType === 'regenerate') {
        return firstOccurrence;
      }

      let monthOffset = 0;
      const interval = Math.max(1, recurrencePattern.interval || 1);

      while (monthOffset < 240) {
        const candidateMonth = new Date(
          normalizedStartDate.getFullYear(),
          normalizedStartDate.getMonth() + monthOffset,
          1
        );
        const candidate = getMonthlyOccurrenceForDate(
          recurrencePattern,
          candidateMonth.getFullYear(),
          candidateMonth.getMonth()
        );
        if (candidate && candidate >= normalizedStartDate) {
          return candidate;
        }
        monthOffset += interval;
      }
      return firstOccurrence;
    }
    default:
      return firstOccurrence;
  }
};

const calculateNextScheduledOccurrence = (recurrencePattern, lastOccurrence) => {
  const normalizedLastOccurrence = normalizeScheduleDate(lastOccurrence);
  if (!normalizedLastOccurrence || !recurrencePattern) return null;

  const nextDate = new Date(normalizedLastOccurrence);

  switch (recurrencePattern.type) {
    case 'daily':
      nextDate.setDate(normalizedLastOccurrence.getDate() + Math.max(1, recurrencePattern.interval || 1));
      return nextDate;
    case 'weekly': {
      const weekdays = recurrencePattern.weekdays || ['monday'];
      const interval = Math.max(1, recurrencePattern.interval || 1);

      for (let i = 1; i <= 7 * interval; i += 1) {
        const candidate = new Date(normalizedLastOccurrence);
        candidate.setDate(normalizedLastOccurrence.getDate() + i);
        const weekdayName = Object.keys(SCHEDULED_WEEKDAY_INDEX).find(
          (key) => SCHEDULED_WEEKDAY_INDEX[key] === candidate.getDay()
        );
        if (weekdayName && weekdays.includes(weekdayName)) {
          return candidate;
        }
      }

      nextDate.setDate(normalizedLastOccurrence.getDate() + (7 * interval));
      return nextDate;
    }
    case 'monthly': {
      if (recurrencePattern.monthlyType === 'regenerate') {
        return null;
      }

      const interval = Math.max(1, recurrencePattern.interval || 1);
      const candidateMonth = new Date(
        normalizedLastOccurrence.getFullYear(),
        normalizedLastOccurrence.getMonth() + interval,
        1
      );
      return getMonthlyOccurrenceForDate(
        recurrencePattern,
        candidateMonth.getFullYear(),
        candidateMonth.getMonth()
      );
    }
    case 'yearly':
      nextDate.setFullYear(normalizedLastOccurrence.getFullYear() + Math.max(1, recurrencePattern.interval || 1));
      return nextDate;
    default:
      return null;
  }
};

const validateRecurrencePattern = (recurrencePattern) => {
  const { type, interval, weekdays } = recurrencePattern || {};

  if (!type || !['daily', 'weekly', 'monthly', 'yearly'].includes(type)) {
    throw new Error('Invalid recurrence type');
  }

  if (!interval || interval < 1) {
    throw new Error('Invalid recurrence interval');
  }

  if (type === 'weekly' && (!Array.isArray(weekdays) || weekdays.length === 0)) {
    throw new Error('Weekly recurrence requires at least one weekday selected');
  }
};

export const createScheduledTask = async (taskData, currentUserId, currentUserName) => {
  try {
    if (!currentUserId || !currentUserName || currentUserName === 'Unknown') {
      console.error('Scheduled task creation blocked: Missing user ID or name.', { currentUserId, currentUserName });
      throw new Error('A valid user ID and name are required to create a scheduled task.');
    }

    if (!taskData?.title || !taskData?.departmentId || !Array.isArray(taskData.assignedUserIds) || taskData.assignedUserIds.length === 0) {
      throw new Error('Missing required fields: title, departmentId, assignedUserIds');
    }

    if (!taskData?.recurrencePattern) {
      throw new Error('Recurrence pattern is required for scheduled tasks');
    }

    validateRecurrencePattern(taskData.recurrencePattern);

    const scheduleStartDate = normalizeScheduleDate(taskData.scheduledStartDate || taskData.targetDate);
    if (!scheduleStartDate) {
      throw new Error('A valid start date is required for scheduled tasks');
    }

    const firstOccurrence = calculateFirstScheduledOccurrence(taskData.recurrencePattern, scheduleStartDate);
    if (!firstOccurrence) {
      throw new Error('Failed to calculate the first scheduled occurrence');
    }

    const scheduledTaskData = {
      title: taskData.title,
      description: taskData.description || '',
      assignedUserIds: taskData.assignedUserIds,
      observerIds: Array.isArray(taskData.observerIds) ? taskData.observerIds : [],
      assignedById: currentUserId,
      assignedByName: currentUserName,
      departmentId: taskData.departmentId,
      difficulty: taskData.difficulty,
      points: taskData.points,
      notes: taskData.notes || [],
      photos: taskData.photos || [],
      isUrgent: taskData.isUrgent || false,
      isRdNewSkill: taskData.isRdNewSkill || false,
      projectSkillName: taskData.isRdNewSkill ? (taskData.projectSkillName || '') : '',
      recurrencePattern: JSON.parse(JSON.stringify(taskData.recurrencePattern)),
      scheduledStartDate: scheduleStartDate.toISOString(),
      targetDate: scheduleStartDate.toISOString(),
      nextOccurrence: Timestamp.fromDate(firstOccurrence),
      occurrenceCount: 0,
      isActive: taskData.isActive !== undefined ? taskData.isActive : true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdById: currentUserId,
      createdByName: currentUserName,
    };

    const res = await addDoc(collection(db, SCHEDULED_TASKS_COLLECTION), scheduledTaskData);
    
    try {
      await logTaskActivity('create_scheduled', { ...scheduledTaskData, id: res.id }, currentUserId, currentUserName, {
        recurrenceType: taskData.recurrencePattern.type,
        interval: taskData.recurrencePattern.interval,
        assignedUserCount: taskData.assignedUserIds?.length || 0,
        isUrgent: taskData.isUrgent || false,
        firstOccurrence: firstOccurrence.toISOString()
      });
    } catch (error) {
      console.warn('Failed to log scheduled task creation activity:', error);
    }
    
    return res.id;
  } catch (error) {
    console.error('Error creating scheduled task:', error);
    throw new Error(`Failed to create scheduled task: ${error.message}`);
  }
};

export const subscribeScheduledTasks = (onChange) => {
  const scheduledTasksRef = collection(db, SCHEDULED_TASKS_COLLECTION);
  
  return onSnapshot(scheduledTasksRef, (snap) => {
    const scheduledTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    onChange(scheduledTasks);
  }, (error) => {
    console.warn('Scheduled tasks listener error:', error);
    // Don't call onChange on error to avoid clearing data
  });
};

export const updateScheduledTask = async (scheduledTaskId, updates = {}, currentUserId, currentUserName = 'Unknown') => {
  const effectiveUserId = currentUserId || (typeof localStorage !== 'undefined' ? localStorage.getItem('kartavya_userId') : null) || 'system';
  const effectiveUserName = currentUserName || (typeof localStorage !== 'undefined' ? (localStorage.getItem('kartavya_userName') || 'Unknown') : 'Unknown');
  const scheduledTaskRef = doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId);
  const scheduledTaskSnap = await getDoc(scheduledTaskRef);

  if (!scheduledTaskSnap.exists()) {
    throw new Error('Scheduled task not found');
  }

  const currentTask = scheduledTaskSnap.data();

  const cleanUpdates = cleanFirestoreData(updates);
  const mergedTask = {
    ...currentTask,
    ...cleanUpdates,
  };

  if (mergedTask.recurrencePattern) {
    validateRecurrencePattern(mergedTask.recurrencePattern);
  }

  const schedulingFieldsChanged = [
    'recurrencePattern',
    'targetDate',
    'scheduledStartDate',
  ].some((key) => Object.prototype.hasOwnProperty.call(cleanUpdates, key));

  const data = { 
    ...cleanUpdates, 
    updatedAt: serverTimestamp(), 
    updatedById: effectiveUserId 
  };

  if (Object.prototype.hasOwnProperty.call(cleanUpdates, 'targetDate')) {
    data.scheduledStartDate = cleanUpdates.targetDate;
  }

  if (schedulingFieldsChanged && mergedTask.isActive) {
    const scheduleStartDate = normalizeScheduleDate(
      mergedTask.scheduledStartDate || mergedTask.targetDate || currentTask.nextOccurrence
    );

    if (!scheduleStartDate) {
      throw new Error('A valid start date is required for scheduled tasks');
    }

    const recalculatedNextOccurrence = calculateFirstScheduledOccurrence(
      mergedTask.recurrencePattern,
      scheduleStartDate
    );

    if (!recalculatedNextOccurrence) {
      throw new Error('Failed to calculate the next scheduled occurrence');
    }

    data.nextOccurrence = Timestamp.fromDate(recalculatedNextOccurrence);
    data.lastError = null;
    data.endedAt = null;
  }
  
  const finalData = cleanFirestoreData(data);
  await updateDoc(scheduledTaskRef, finalData);
  
  try {
    await logTaskActivity('update_scheduled', { id: scheduledTaskId, ...updates }, effectiveUserId, effectiveUserName, {
      changes: Object.keys(updates),
      scheduledTaskId: scheduledTaskId
    });
  } catch (error) {
    console.warn('Failed to log scheduled task update activity:', error);
  }
};

export const deleteScheduledTask = async (scheduledTaskId, currentUserId = 'system', currentUserName = 'System') => {
  // Get the current scheduled task data for logging
  let currentScheduledTask = null;
  try {
    const scheduledTaskRef = doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId);
    const scheduledTaskSnap = await getDoc(scheduledTaskRef);
    if (scheduledTaskSnap.exists()) {
      currentScheduledTask = { id: scheduledTaskSnap.id, ...scheduledTaskSnap.data() };
    }
  } catch (error) {
    console.warn('Failed to get current scheduled task for logging:', error);
  }

  await deleteDoc(doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId));
  
  // Log scheduled task deletion activity
  if (currentScheduledTask) {
    try {
      await logTaskActivity('delete_scheduled', currentScheduledTask, currentUserId, currentUserName, {
        scheduledTaskId: scheduledTaskId,
        recurrenceType: currentScheduledTask.recurrencePattern?.type,
        occurrenceCount: currentScheduledTask.occurrenceCount || 0
      });
    } catch (error) {
      console.warn('Failed to log scheduled task deletion activity:', error);
    }
  }
};

export const getScheduledTask = async (scheduledTaskId) => {
  const ref = doc(db, SCHEDULED_TASKS_COLLECTION, scheduledTaskId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

export const triggerScheduledTasks = async () => {
  try {
    // Get the Firebase project ID from the config
    const projectId = 'kartavya-58d2c'; // You may want to get this from environment variables
    const region = 'asia-south1'; // Fixed: Match the region where functions are deployed
    const functionUrl = `https://${region}-${projectId}.cloudfunctions.net/processScheduledTasksHttp`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error triggering scheduled tasks:', error);
    throw new Error('Failed to trigger scheduled tasks processing.');
  }
};



