import { useEffect, useState, useCallback } from 'react';
import { subscribeTasks, createTask, patchTask, removeTask } from '../api/taskApi.js';

export default function useTasks(currentUser) {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const unsub = subscribeTasks(setTasks);
    return () => unsub && unsub();
  }, []);

  const addTask = useCallback(async (task) => {
    return await createTask(task, currentUser?.id || null, currentUser?.name || currentUser?.username || 'Unknown');
  }, [currentUser]);

  const updateTask = useCallback(async (patch) => {
    // Handle both full task objects and patch objects
    if (!patch || typeof patch !== 'object') {
      throw new Error('Invalid task data provided to updateTask');
    }
    
    const { id, ...rest } = patch;
    if (!id) {
      throw new Error('Task ID is required for update');
    }
    
    await patchTask(id, rest, currentUser?.id || null, currentUser?.name || currentUser?.username || 'Unknown');
  }, [currentUser]);

  const deleteTask = useCallback(async (taskId, deleteReason = 'No reason provided') => {
    await removeTask(taskId, currentUser?.id || 'system', currentUser?.name || currentUser?.username || 'System', deleteReason);
  }, [currentUser]);

  return { tasks, addTask, updateTask, deleteTask };
}



