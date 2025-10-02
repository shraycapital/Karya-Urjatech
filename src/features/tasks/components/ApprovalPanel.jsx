import React, { useState, useEffect } from 'react';
import { ROLES } from '../../../shared/constants';

/**
 * ApprovalPanel - Shows pending self-assigned tasks that need approval from department heads, management, and admins
 * Similar to the priority nudge panel in TasksTab
 */
export default function ApprovalPanel({ 
  tasks, 
  currentUser, 
  users,
  onApprove, 
  onReject,
  onEdit,
  onDismiss, 
  t 
}) {
  // Only show to department heads, management, and admins
  if (currentUser?.role !== ROLES.HEAD && currentUser?.role !== ROLES.MANAGEMENT && currentUser?.role !== ROLES.ADMIN) {
    return null;
  }

  // Get user's department(s) - Admins and Management can see all departments
  const userDepartments = currentUser?.departmentIds || [];
  const canSeeAllDepartments = currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.MANAGEMENT;
  
  // State for dismissed approvals to make it reactive
  const [dismissedApprovals, setDismissedApprovals] = useState([]);
  
  // Get dismissed approvals from localStorage
  const getDismissedApprovals = () => {
    const storageKey = `kartavya_dismissed_approval_${currentUser.id}`;
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch (error) {
      console.error('Error reading dismissed approvals:', error);
      return [];
    }
  };
  
  // Load dismissed approvals on component mount
  useEffect(() => {
    setDismissedApprovals(getDismissedApprovals());
  }, [currentUser.id]);
  
  // Handle dismiss with state update
  const handleDismiss = (taskId) => {
    const storageKey = `kartavya_dismissed_approval_${currentUser.id}`;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (!existing.includes(taskId)) {
        const updated = [...existing, taskId];
        localStorage.setItem(storageKey, JSON.stringify(updated));
        setDismissedApprovals(updated);
      }
    } catch (error) {
      console.error('Error storing dismissed approval:', error);
    }
    
    // Call the parent's dismiss handler
    onDismiss(taskId);
  };
  
  // Find tasks that need approval in the user's department(s)
  const tasksNeedingApproval = tasks.filter(task => {
    // Must need approval and not yet approved
    if (!task.needsApproval || task.approvedBy) {
      return false;
    }
    
    // Must be in one of the user's departments (or all departments for Admin/Management)
    if (!canSeeAllDepartments && !userDepartments.includes(task.departmentId)) {
      return false;
    }
    
    // Don't show if the user is the one who created it
    if (task.assignedById === currentUser.id) {
      return false;
    }
    
    // Don't show if dismissed by this user
    if (dismissedApprovals.includes(task.id)) {
      return false;
    }
    
    return true;
  });

  if (tasksNeedingApproval.length === 0) {
    return null;
  }

  // Get the next task to approve (oldest first)
  const nextTask = tasksNeedingApproval.sort((a, b) => {
    const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
    const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
    return aTime - bTime;
  })[0];

  // Get task creator info
  const taskCreator = users.find(u => u.id === nextTask.assignedById);
  const creatorName = taskCreator?.name || nextTask.assignedByName || 'Unknown';

  // Format difficulty
  const difficultyBadge = {
    easy: { label: 'Easy', color: 'bg-green-100 text-green-800' },
    medium: { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
    hard: { label: 'Hard', color: 'bg-orange-100 text-orange-800' },
    critical: { label: 'Critical', color: 'bg-red-100 text-red-800' }
  }[nextTask.difficulty] || { label: nextTask.difficulty, color: 'bg-gray-100 text-gray-800' };

  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <span className="text-amber-600">⏳</span>
            {t('approvalNeeded', 'Approval Required')}
          </div>
          <p className="mt-1 text-xs text-amber-700">
            {tasksNeedingApproval.length === 1 
              ? t('oneTaskNeedsApproval', '1 self-assigned task needs your approval')
              : t('multipleTasksNeedApproval', `${tasksNeedingApproval.length} self-assigned tasks need your approval`)
            }
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleDismiss(nextTask.id)}
          className="text-xs text-amber-600 hover:text-amber-800"
        >
          {t('dismiss', 'Dismiss')}
        </button>
      </div>

      {/* Show count badge */}
      {tasksNeedingApproval.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-amber-700">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
            {tasksNeedingApproval.length} {t('pendingApprovals', 'pending approvals')}
          </span>
        </div>
      )}

      {/* Next task to approve */}
      <div className="mt-3 rounded-lg border border-amber-200 bg-white/80 p-3 shadow-inner">
        <div className="text-xs font-medium text-amber-600">
          {t('nextApproval', 'Next approval')}
        </div>
        
        <div className="mt-1 text-sm font-medium text-amber-800 line-clamp-2">
          {nextTask.title || t('untitledTask', 'Untitled task')}
        </div>
        
        {nextTask.description && (
          <div className="mt-1 text-xs text-slate-600 line-clamp-2">
            {nextTask.description}
          </div>
        )}
        
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {/* Task creator */}
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
            👤 {creatorName}
          </span>
          
          {/* Difficulty badge */}
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${difficultyBadge.color}`}>
            {difficultyBadge.label}
          </span>
          
          {/* Points */}
          {nextTask.points && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800">
              {nextTask.points} pts
            </span>
          )}
          
          {/* Urgent badge */}
          {nextTask.isUrgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-800">
              🚨 {t('urgent', 'Urgent')}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onApprove(nextTask.id)}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            ✓ {t('approve', 'Approve')}
          </button>
          <button
            type="button"
            onClick={() => onEdit(nextTask.id)}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            ✏️ {t('edit', 'Edit')}
          </button>
          <button
            type="button"
            onClick={() => onReject(nextTask.id)}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            ✗ {t('reject', 'Reject')}
          </button>
        </div>
      </div>
    </div>
  );
}

