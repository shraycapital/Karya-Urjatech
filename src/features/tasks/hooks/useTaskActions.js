import { useCallback, useMemo, useState, useEffect } from 'react';
import { STATUSES } from '../../../shared/constants';

export default function useTaskActions({ tasks, onUpdateTask, onLogActivity, t, currentUser }) {
  const [optimistic, setOptimistic] = useState({}); // id -> partial task overrides
  const [completionModalTask, setCompletionModalTask] = useState(null);
  const [confettiKey, setConfettiKey] = useState(0);

  // Clear optimistic overrides whenever upstream tasks change
  useEffect(() => { setOptimistic({}); }, [tasks]);

  const nextStatus = useCallback((status) => {
    if (status === STATUSES.PENDING) return STATUSES.ONGOING;
    if (status === STATUSES.ONGOING) return STATUSES.COMPLETE;
    if (status === STATUSES.COMPLETE) return STATUSES.PENDING; // Allow reopening completed tasks
    return STATUSES.PENDING;
  }, []);

  const handleFinishClick = useCallback((task) => setCompletionModalTask(task), []);

  const handleCompleteSubmit = useCallback((taskId, completionData) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Check if task needs approval first (for self-assigned tasks)
    if (task.needsApproval && !task.approvedBy) {
      const approvalMessage = t('taskNeedsApproval', 
        'This self-assigned task requires approval from a department head before it can be completed. Please wait for approval.');
      alert(approvalMessage);
      return;
    }
    
    // Check if task is rejected - cannot be completed
    if (task.status === STATUSES.REJECTED) {
      const rejectionMessage = t('taskRejected', 
        'This task has been rejected and cannot be completed. Please edit or delete the task.');
      alert(rejectionMessage);
      return;
    }

    // A material_request task cannot be blocked, so skip this check for it.
    if (task.type !== 'material_request') {
      // Check if this task has any blocking material requests that aren't completed
      const blockingRequests = tasks.filter(t => 
        t.type === 'material_request' && 
        t.originalTaskId === taskId && 
        t.status !== STATUSES.COMPLETE
      );

      if (blockingRequests.length > 0) {
        alert(`Cannot complete this task. The following material requests must be completed first:\n\n${blockingRequests.map(r => `• ${r.title}`).join('\n')}`);
        return;
      }
    }

    const newNote = completionData.note ? { text: completionData.note, type: 'completion' } : null;
    const newPhoto = completionData.photo || null;

    if (onLogActivity) {
      onLogActivity('complete', 'task', taskId, task.title, null, null, {
        hasNote: !!newNote,
        hasPhoto: !!newPhoto,
        completionTime: new Date().toISOString()
      });
    }

    onUpdateTask({
      id: taskId,
      status: STATUSES.COMPLETE,
      // Let the API handle completedAt with serverTimestamp for consistency
      notes: newNote ? [...(task.notes || []), newNote] : task.notes || [],
      photos: newPhoto ? [...(task.photos || []), newPhoto] : task.photos || [],
    });
    setCompletionModalTask(null);
    setConfettiKey((k) => k + 1);
  }, [tasks, onLogActivity, onUpdateTask, STATUSES]);

  const handleCycleStatus = useCallback((task) => {
    const newStatus = nextStatus(task.status);
    
    // Check if task needs approval before completing (for self-assigned tasks)
    if (newStatus === STATUSES.COMPLETE && task.needsApproval && !task.approvedBy) {
      const approvalMessage = t('taskNeedsApproval', 
        'This self-assigned task requires approval from a department head before it can be completed. Please wait for approval.');
      alert(approvalMessage);
      return;
    }
    
    // Check if task is rejected - cannot be completed
    if (newStatus === STATUSES.COMPLETE && task.status === STATUSES.REJECTED) {
      const rejectionMessage = t('taskRejected', 
        'This task has been rejected and cannot be completed. Please edit or delete the task.');
      alert(rejectionMessage);
      return;
    }
    
    const patch = { id: task.id, status: newStatus };

    // Handle reopening completed tasks
    if (task.status === STATUSES.COMPLETE && newStatus === STATUSES.PENDING) {
      patch.completedAt = null; // Clear completion timestamp
      patch.startedAt = null; // Clear started timestamp when reopening
    }

    if (onLogActivity) {
      const action = newStatus === STATUSES.ONGOING ? 'start' : 
                    newStatus === STATUSES.COMPLETE ? 'complete' : 
                    newStatus === STATUSES.PENDING && task.status === STATUSES.COMPLETE ? 'reopen' : 'update';
      onLogActivity(action, 'task', task.id, task.title, null, null, {
        previousStatus: task.status,
        newStatus: newStatus,
        action: action
      });
    }

    setOptimistic((prev) => ({ ...prev, [task.id]: patch }));
    onUpdateTask(patch).catch(() => {
      setOptimistic((prev) => { const next = { ...prev }; delete next[task.id]; return next; });
    });
    if (newStatus === STATUSES.COMPLETE) setConfettiKey((k) => k + 1);
  }, [onLogActivity, onUpdateTask, nextStatus]);

  const effectiveTasks = useMemo(
    () => tasks.map((t) => (optimistic[t.id] ? { ...t, ...optimistic[t.id] } : t)),
    [tasks, optimistic]
  );

  return {
    STATUSES,
    effectiveTasks,
    optimistic,
    setOptimistic,
    completionModalTask,
    setCompletionModalTask,
    handleFinishClick,
    handleCompleteSubmit,
    handleCycleStatus,
    confettiKey,
    setConfettiKey,
  };
}



