import React, { useMemo, useState, useEffect } from 'react';
import TaskEditor from './TaskEditor.jsx';
import EditTaskModal from './EditTaskModal.jsx';
import CompletionModal from './CompletionModal.jsx';
import RequestModal from './RequestModal.jsx';
import CommentModal from './CommentModal.jsx';
import useTaskActions from '../hooks/useTaskActions.js';
import { formatDateTime, formatDateOnly, toSafeDate } from '../../../shared/utils/date.js';
import { DIFFICULTY_CONFIG, STATUSES } from '../../../shared/constants.js';

/**
 * Desktop-optimized table view for tasks (Jira/Linear-style).
 * Same functionality as TaskList but with compact table layout for power users.
 */
export default function TaskListTable({
  tasks = [],
  allTasks = [],
  onUpdateTask,
  deleteTask,
  onLogActivity,
  t,
  isReadOnly = false,
  currentUser,
  users = [],
  departments = [],
  onCreateRequest,
  onAddComment,
  onDeleteComment,
  openTaskId,
  onUpdateTaskLocal,
  showAssignedUsers = false,
  selectionMode = false,
  selectedTaskIds = [],
  onToggleSelectTask = null,
  isTaskSelectable = null,
}) {
  const {
    effectiveTasks,
    completionModalTask,
    setCompletionModalTask,
    handleFinishClick,
    handleCompleteSubmit,
    handleCycleStatus,
  } = useTaskActions({ tasks, onUpdateTask, onLogActivity, t, currentUser });

  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [requestModalTask, setRequestModalTask] = useState(null);
  const [commentModalTask, setCommentModalTask] = useState(null);
  const [loadedPhotos, setLoadedPhotos] = useState(new Set());
  const [sortField, setSortField] = useState('targetDate');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (!openTaskId) return;
    const exists = tasks.find((t) => t.id === openTaskId);
    if (exists) setExpandedTaskId(openTaskId);
  }, [openTaskId, tasks]);

  useEffect(() => {
    if (expandedTaskId && tasks.length > 0) {
      const task = tasks.find((t) => t.id === expandedTaskId);
      if (task?.photos?.length > 0 && !loadedPhotos.has(expandedTaskId)) {
        setTimeout(() => setLoadedPhotos((prev) => new Set([...prev, expandedTaskId])), 100);
      }
    }
  }, [expandedTaskId, tasks, loadedPhotos]);

  const tasksWithBlockingInfo = useMemo(() => {
    return effectiveTasks.map((task) => {
      const blockingTasks = allTasks.filter(
        (t) => t.type === 'material_request' && t.originalTaskId === task.id && t.status !== STATUSES.COMPLETE
      );
      return { ...task, hasBlockingTasks: blockingTasks.length > 0, blockingTasks };
    });
  }, [effectiveTasks, allTasks, STATUSES]);

  const sortedTasks = useMemo(() => {
    const list = [...tasksWithBlockingInfo].sort((a, b) => {
      if (a.status === STATUSES.COMPLETE && b.status !== STATUSES.COMPLETE) return 1;
      if (a.status !== STATUSES.COMPLETE && b.status === STATUSES.COMPLETE) return -1;
      if (a.status !== STATUSES.COMPLETE && b.status !== STATUSES.COMPLETE) {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
      }
      const getVal = (task, field) => {
        if (field === 'targetDate') return toSafeDate(task.targetDate)?.getTime() ?? 0;
        if (field === 'title') return (task.title || '').toLowerCase();
        if (field === 'status') return [STATUSES.ONGOING, STATUSES.PENDING, STATUSES.COMPLETE].indexOf(task.status);
        if (field === 'points') return task.points ?? DIFFICULTY_CONFIG[task.difficulty]?.points ?? 0;
        return 0;
      };
      const va = getVal(a, sortField);
      const vb = getVal(b, sortField);
      const cmp = typeof va === 'string' ? va.localeCompare(vb) : (va || 0) - (vb || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [tasksWithBlockingInfo, sortField, sortDir, STATUSES]);

  const handleSort = (field) => {
    setSortField(field);
    setSortDir((d) => (sortField === field ? (d === 'asc' ? 'desc' : 'asc') : 'asc'));
  };

  const handleRequestMaterial = (task) => setRequestModalTask(task);
  const handleAddComment = (task) => setCommentModalTask(task);
  const handleCommentSubmit = async (commentText) => {
    if (!commentModalTask) return;
    try {
      await onAddComment(commentModalTask.id, commentText);
      setCommentModalTask(null);
    } catch (e) {
      console.error('Error adding comment:', e);
    }
  };
  const handleCreateRequest = async (data) => {
    if (onCreateRequest) await onCreateRequest(data);
  };

  const getAssigneeNames = (task) => {
    if (!task.assignedUserIds?.length) return '-';
    return task.assignedUserIds
      .map((id) => users.find((u) => u.id === id)?.name)
      .filter(Boolean)
      .join(', ') || '-';
  };

  const getPoints = (task) => {
    const cfg = task.difficulty ? DIFFICULTY_CONFIG[task.difficulty] : DIFFICULTY_CONFIG.hard;
    const base = task.points ?? cfg?.points ?? 50;
    const count = task.assignedUserIds?.length || 1;
    let pts = Math.round(base / count);
    if (count > 1) pts = Math.round(pts * 1.1);
    if (task.isUrgent) pts = Math.round(pts * 1.25);
    return pts;
  };

  const SortHeader = ({ field, label }) => (
    <th
      className="cursor-pointer select-none text-left text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-700"
      onClick={() => handleSort(field)}
    >
      {label}
      {sortField === field && (
        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
  );

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {selectionMode && (
                <th className="w-10 px-3 py-2.5 text-left">
                  <span className="sr-only">{t('selectTask', 'Select')}</span>
                </th>
              )}
              <SortHeader field="title" label={t('task') || 'Task'} />
              <SortHeader field="status" label={t('status') || 'Status'} />
              {showAssignedUsers && (
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('assignedTo') || 'Assignee'}
                </th>
              )}
              <SortHeader field="targetDate" label={t('targetDate') || 'Due'} />
              <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('points') || 'Pts'}
              </th>
              {!isReadOnly && (
                <th className="w-32 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('actions') || 'Actions'}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {sortedTasks.map((task) => {
              const isExpanded = expandedTaskId === task.id;
              const isCurrentUserObserver =
                !!currentUser?.id && Array.isArray(task.observerIds) && task.observerIds.includes(currentUser.id);
              const isCurrentUserAssigned =
                !!currentUser?.id && Array.isArray(task.assignedUserIds) && task.assignedUserIds.includes(currentUser.id);
              const isObserverOnly = isCurrentUserObserver && !isCurrentUserAssigned;
              const canAct = !isReadOnly && !isObserverOnly;
              const isSelected = selectedTaskIds.includes(task.id);
              const isSelectable = typeof isTaskSelectable === 'function' ? isTaskSelectable(task) : true;

              return (
                <React.Fragment key={task.id}>
                  <tr
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      isExpanded ? 'bg-blue-50/50' : ''
                    } ${isSelected ? 'bg-blue-50' : ''}`}
                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                  >
                    {selectionMode && (
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <label className={`flex ${isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                            checked={isSelected}
                            disabled={!isSelectable}
                            onChange={() => isSelectable && onToggleSelectTask?.(task.id)}
                          />
                        </label>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        {task.hasBlockingTasks && (
                          <span className="text-red-600" title="Blocked">🔒</span>
                        )}
                        <span className="font-medium text-slate-900 line-clamp-2">{task.title}</span>
                        {task.isUrgent && (
                          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            URGENT
                          </span>
                        )}
                      </div>
                      {task.notes?.[0]?.text && (
                        <div className="mt-0.5 text-xs text-slate-500 line-clamp-1">{task.notes[0].text}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          task.status === STATUSES.COMPLETE
                            ? 'bg-green-100 text-green-800'
                            : task.status === STATUSES.ONGOING
                            ? 'bg-blue-100 text-blue-800'
                            : task.status === STATUSES.REJECTED || task.status === STATUSES.DELETED
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    {showAssignedUsers && (
                      <td className="max-w-[140px] px-3 py-2 text-slate-600">
                        <span className="truncate block" title={getAssigneeNames(task)}>
                          {getAssigneeNames(task)}
                        </span>
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                      {task.targetDate ? formatDateOnly(task.targetDate) : '-'}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-700">{getPoints(task)}</td>
                    {!isReadOnly && (
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {canAct && (
                          <div className="flex justify-end gap-1">
                            {task.status === STATUSES.PENDING && !task.hasBlockingTasks && (
                              <button
                                onClick={() => handleCycleStatus(task)}
                                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                              >
                                {t('start')}
                              </button>
                            )}
                            {task.status === STATUSES.ONGOING && (
                              <button
                                onClick={() => handleFinishClick(task)}
                                disabled={task.needsApproval && !task.approvedBy}
                                className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {t('finish')}
                              </button>
                            )}
                            {task.status === STATUSES.COMPLETE && (
                              <button
                                onClick={() => handleCycleStatus(task)}
                                className="rounded bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-300"
                              >
                                {t('reopen')}
                              </button>
                            )}
                            {(currentUser?.role === 'Admin' ||
                              currentUser?.role === 'Head' ||
                              task.assignedById === currentUser?.id ||
                              (Array.isArray(task.observerIds) && task.observerIds.includes(currentUser?.id))) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTask(task);
                                }}
                                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="bg-slate-50/80 p-4">
                        <TaskEditor
                          task={task}
                          onRequestMaterial={() => handleRequestMaterial(task)}
                          hasBlockingTasks={task.hasBlockingTasks}
                          blockingTasks={task.blockingTasks}
                          onAddComment={() => handleAddComment(task)}
                          comments={task.comments || []}
                          t={t}
                          currentUser={currentUser}
                          onDeleteComment={onDeleteComment}
                        >
                          <div className="mt-3 space-y-2 text-sm">
                            <div><strong>{t('assigned')}:</strong> {toSafeDate(task.createdAt) ? formatDateTime(toSafeDate(task.createdAt)) : 'N/A'}</div>
                            <div><strong>{t('assignedBy')}:</strong> {users.find((u) => u.id === task.assignedById)?.name || 'Unknown'}</div>
                            {task.targetDate && (
                              <div><strong>{t('targetDate')}:</strong> {formatDateOnly(task.targetDate)}</div>
                            )}
                            {(currentUser?.role === 'Admin' || currentUser?.role === 'Head' || task.assignedById === currentUser?.id ||
                              (Array.isArray(task.observerIds) && task.observerIds.includes(currentUser?.id))) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTask(task);
                                }}
                                className="btn btn-xs btn-secondary mt-2"
                              >
                                ✏️ {t('editTask')}
                              </button>
                            )}
                            {task.photos?.length > 0 && loadedPhotos.has(task.id) && (
                              <div className="mt-3">
                                <strong className="text-slate-700">Photos ({task.photos.length})</strong>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {task.photos.map((p, i) => (
                                    <img
                                      key={i}
                                      src={p}
                                      alt={`photo ${i + 1}`}
                                      className="h-20 rounded-lg border object-cover cursor-pointer hover:opacity-80"
                                      loading="lazy"
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </TaskEditor>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sortedTasks.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-500">
          <div className="text-2xl">🎉</div>
          <div className="mt-1 font-medium">{t('noTasksFriendly')}</div>
          <div className="text-xs">{t('noTasksSub')}</div>
        </div>
      )}

      {completionModalTask && (
        <CompletionModal
          task={completionModalTask}
          onClose={() => setCompletionModalTask(null)}
          onConfirm={(id, data) => handleCompleteSubmit(id, data)}
          t={t}
        />
      )}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (u) => await onUpdateTask(u)}
          onDelete={async (id, reason) => {
            if (deleteTask) await deleteTask(id, reason);
            setEditingTask(null);
          }}
          users={users}
          departments={departments}
          currentUser={currentUser}
          t={t}
        />
      )}
      {requestModalTask && (
        <RequestModal
          task={requestModalTask}
          onClose={() => setRequestModalTask(null)}
          onCreateRequest={handleCreateRequest}
          departments={departments}
          users={users}
          currentUser={currentUser}
          t={t}
        />
      )}
      {commentModalTask && (
        <CommentModal
          task={commentModalTask}
          onClose={() => setCommentModalTask(null)}
          onAddComment={handleCommentSubmit}
          currentUser={currentUser}
          t={t}
        />
      )}
    </>
  );
}
