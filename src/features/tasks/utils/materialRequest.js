import { STATUSES } from '../../../shared/constants.js';
import { createTask, patchTask, getTask } from '../api/taskApi.js';
import { logActivity } from '../../../shared/utils/activityLogger.js';

/**
 * Create a material/info request as a separate task and mark the original task as blocked.
 * Centralized helper to avoid duplicate implementations across views.
 */
export async function createMaterialRequest(requestData, currentUser) {
  // Robust check for currentUser before creating the request.
  if (!currentUser || !currentUser.id || !currentUser.name) {
    console.error('Material request blocked: Missing currentUser data.');
    throw new Error('Valid user information is required to create a material request.');
  }

  if (!requestData?.originalTaskId) throw new Error('originalTaskId is required');

  // Fetch original task to derive original assignees and validate
  const originalTask = await getTask(requestData.originalTaskId);
  if (!originalTask) throw new Error('Original task not found');

  let originalAssignedUsers = [];
  if (Array.isArray(originalTask.assignedUserIds)) {
    originalAssignedUsers = originalTask.assignedUserIds;
  } else if (originalTask.assignedUserId) {
    originalAssignedUsers = [originalTask.assignedUserId];
  }

  const newRequestTask = {
    ...requestData,
    title: `${requestData.originalTaskTitle} - request`,
    departmentId: requestData.departmentId,
    assignedUserIds: requestData.assignedUserIds,
    status: STATUSES.PENDING,
    assignedById: currentUser.id,
    type: 'material_request',
    originalTaskId: requestData.originalTaskId,
    originalTaskTitle: requestData.originalTaskTitle,
    requestingDepartmentId: requestData.requestingDepartmentId,
    requestingUserId: requestData.requestingUserId,
    requestingUserName: requestData.requestingUserName,
    isBlocking: true,
    targetDate: requestData.expectedDeliveryDate,
    description: requestData.description,
    originalAssignedUsers,
    notes: requestData.description ? [{ text: requestData.description, type: 'request' }] : []
  };

  // Create the request task
  await createTask(newRequestTask, currentUser.id, currentUser.name);

  // Mark original task as having blocking requests
  await patchTask(requestData.originalTaskId, { hasBlockingTasks: true }, currentUser.id, currentUser.name);

  // Log material request activity
  try {
    await logActivity('request_material', 'task', requestData.originalTaskId, originalTask.title, currentUser.id, currentUser.name, {
      requestTitle: newRequestTask.title,
      requestDescription: newRequestTask.description,
      assignedToUsers: requestData.assignedUserIds,
      difficulty: requestData.difficulty,
      urgency: requestData.urgency,
      expectedDelivery: requestData.expectedDelivery
    });
  } catch (error) {
    console.warn('Failed to log material request activity:', error);
  }
}


