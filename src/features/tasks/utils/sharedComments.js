/**
 * Utility functions for managing shared comments between original tasks and their request tasks
 */

/**
 * Get all related task IDs (original task + all request tasks)
 * @param {string} taskId - The task ID to check
 * @param {Array} allTasks - All tasks in the system
 * @returns {Array<string>} Array of related task IDs
 */
export function getRelatedTaskIds(taskId, allTasks) {
  if (!taskId || !allTasks) return [taskId];
  
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return [taskId];
  
  const relatedIds = new Set([taskId]);
  
  // If this is a request task, include the original task
  if (task.originalTaskId) {
    relatedIds.add(task.originalTaskId);
  }
  
  // Find all request tasks that reference this task as their original
  allTasks.forEach(t => {
    if (t.originalTaskId === taskId && t.type === 'material_request') {
      relatedIds.add(t.id);
    }
  });
  
  return Array.from(relatedIds);
}

/**
 * Get all related tasks
 * @param {string} taskId - The task ID to check
 * @param {Array} allTasks - All tasks in the system
 * @returns {Array} Array of related tasks
 */
export function getRelatedTasks(taskId, allTasks) {
  const relatedIds = getRelatedTaskIds(taskId, allTasks);
  return allTasks.filter(t => relatedIds.includes(t.id));
}

/**
 * Merge and deduplicate comments from related tasks
 * @param {string} taskId - The task ID
 * @param {Array} allTasks - All tasks in the system
 * @returns {Array} Merged and deduplicated comments array
 */
export function getMergedComments(taskId, allTasks) {
  const relatedTasks = getRelatedTasks(taskId, allTasks);
  const commentsMap = new Map();
  
  // Collect all comments from related tasks, using ID as key for deduplication
  relatedTasks.forEach(task => {
    if (task.comments && Array.isArray(task.comments)) {
      task.comments.forEach(comment => {
        if (comment && comment.id) {
          // If comment already exists, prefer the one with later createdAt
          const existing = commentsMap.get(comment.id);
          if (!existing || (comment.createdAt && existing.createdAt)) {
            // Compare timestamps if both exist
            const commentTime = comment.createdAt?.toMillis?.() || 
                               (comment.createdAt?.seconds ? comment.createdAt.seconds * 1000 : 0) ||
                               (new Date(comment.createdAt).getTime() || 0);
            const existingTime = existing?.createdAt?.toMillis?.() || 
                                (existing?.createdAt?.seconds ? existing.createdAt.seconds * 1000 : 0) ||
                                (new Date(existing?.createdAt).getTime() || 0);
            
            if (!existing || commentTime > existingTime) {
              commentsMap.set(comment.id, comment);
            }
          }
        }
      });
    }
  });
  
  // Convert map to array and sort by creation time (oldest first)
  const mergedComments = Array.from(commentsMap.values());
  mergedComments.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 
                 (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0) ||
                 (new Date(a.createdAt).getTime() || 0);
    const bTime = b.createdAt?.toMillis?.() || 
                 (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0) ||
                 (new Date(b.createdAt).getTime() || 0);
    return aTime - bTime;
  });
  
  return mergedComments;
}




