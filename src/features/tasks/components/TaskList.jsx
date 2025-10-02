import React, { useMemo, useState, useEffect } from 'react';
import TaskItem from './TaskItem.jsx';
import TaskEditor from './TaskEditor.jsx';
import EditTaskModal from './EditTaskModal.jsx';
import CompletionModal from './CompletionModal.jsx';
import RequestModal from './RequestModal.jsx';
import CommentModal from './CommentModal.jsx';
import useTaskActions from '../../tasks/hooks/useTaskActions.js';
import { formatDateTime, formatDateOnly, toSafeDate } from '../../../shared/utils/date.js';

export default function TaskList({
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
  showAssignedUsers = false,
}) {
  const {
    STATUSES,
    effectiveTasks,
    completionModalTask,
    setCompletionModalTask,
    handleFinishClick,
    handleCompleteSubmit,
    handleCycleStatus,
  } = useTaskActions({ tasks, onUpdateTask, onLogActivity, t, currentUser });

  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [fileViewerFiles, setFileViewerFiles] = useState([]);
  const [fileViewerTitle, setFileViewerTitle] = useState('');
  const [editingTask, setEditingTask] = useState(null);
  const [requestModalTask, setRequestModalTask] = useState(null);
  const [commentModalTask, setCommentModalTask] = useState(null);
  const [photoModal, setPhotoModal] = useState({ isOpen: false, photo: null, title: '' });
  const [loadedPhotos, setLoadedPhotos] = useState(new Set());
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoPosition, setPhotoPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Auto-expand a task if openTaskId provided
  useEffect(() => {
    if (!openTaskId) return;
    const exists = tasks.find(t => t.id === openTaskId);
    if (exists) {
      setExpandedTaskId(openTaskId);
    }
  }, [openTaskId, tasks]);

  // Progressive photo loading - load photos when task is expanded
  useEffect(() => {
    if (expandedTaskId && tasks.length > 0) {
      const task = tasks.find(t => t.id === expandedTaskId);
      if (task?.photos?.length > 0 && !loadedPhotos.has(expandedTaskId)) {
        // Load photos for expanded task
        setTimeout(() => {
          setLoadedPhotos(prev => new Set([...prev, expandedTaskId]));
        }, 100);
      }
    }
  }, [expandedTaskId, tasks, loadedPhotos]);

  // Handle ESC key to close photo modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && photoModal.isOpen) {
        setPhotoModal({ isOpen: false, photo: null, title: '' });
      }
    };

    if (photoModal.isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [photoModal.isOpen]);

  const handlePhotoClick = (photo, taskTitle) => {
    setPhotoModal({ isOpen: true, photo, title: taskTitle });
    setPhotoZoom(1);
    setPhotoPosition({ x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setPhotoZoom(prev => Math.min(prev * 1.5, 5));
  };

  const handleZoomOut = () => {
    setPhotoZoom(prev => Math.max(prev / 1.5, 0.5));
  };

  const handleResetZoom = () => {
    setPhotoZoom(1);
    setPhotoPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e) => {
    if (photoZoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - photoPosition.x, y: e.clientY - photoPosition.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && photoZoom > 1) {
      setPhotoPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  };

  // Find blocking tasks for each task
  const tasksWithBlockingInfo = useMemo(() => {
    return effectiveTasks.map(task => {
      const blockingTasks = allTasks.filter(t => 
        t.type === 'material_request' && 
        t.originalTaskId === task.id && 
        t.status !== STATUSES.COMPLETE
      );
      
      return {
        ...task,
        hasBlockingTasks: blockingTasks.length > 0,
        blockingTasks: blockingTasks.map(bt => ({
          ...bt,
          users: users // Pass users for display
        }))
      };
    });
  }, [effectiveTasks, allTasks, users, STATUSES]);

  const sortedTasks = useMemo(() => {
    const list = [...tasksWithBlockingInfo].sort((a, b) => {
      // First priority: Completed tasks always go to the bottom
      if (a.status === STATUSES.COMPLETE && b.status !== STATUSES.COMPLETE) return 1;
      if (a.status !== STATUSES.COMPLETE && b.status === STATUSES.COMPLETE) return -1;
      
      // Second priority: Among non-completed tasks, urgent tasks go first
      if (a.status !== STATUSES.COMPLETE && b.status !== STATUSES.COMPLETE) {
        if (a.isUrgent && !b.isUrgent) return -1;
        if (!a.isUrgent && b.isUrgent) return 1;
      }
      
      // Third priority: Status order for non-completed tasks (Ongoing > Pending)
      if (a.status !== STATUSES.COMPLETE && b.status !== STATUSES.COMPLETE) {
        const orderA = [STATUSES.ONGOING, STATUSES.PENDING].indexOf(a.status);
        const orderB = [STATUSES.ONGOING, STATUSES.PENDING].indexOf(b.status);
        if (orderA !== orderB) return orderA - orderB;
      }
      
      // Fourth priority: Target date (earlier dates first)
      if (a.targetDate && b.targetDate) return new Date(a.targetDate) - new Date(b.targetDate);
      if (a.targetDate) return -1;
      if (b.targetDate) return 1;
      
      return 0;
    });
    return list;
  }, [tasksWithBlockingInfo, STATUSES]);

  const handleRequestMaterial = (task) => {
    setRequestModalTask(task);
  };

  const handleAddComment = (task) => {
    setCommentModalTask(task);
  };

  const handleCommentSubmit = async (commentText) => {
    if (!commentModalTask) return;
    
    try {
      await onAddComment(commentModalTask.id, commentText);
      setCommentModalTask(null);
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleCreateRequest = async (requestData) => {
    if (onCreateRequest) {
      await onCreateRequest(requestData);
    }
  };

  return (
    <>
      <ul className="space-y-2">
        {sortedTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            STATUSES={STATUSES}
            isReadOnly={isReadOnly}
            t={t}
            currentUser={currentUser}
            blockingTasks={task.blockingTasks || []}
            onStart={() => handleCycleStatus(task)}
            onFinish={() => handleFinishClick(task)}
            onToggleExpand={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
            expanded={expandedTaskId === task.id ? (
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
                <div className="mt-2 text-sm space-y-2">
                  <div><strong>{t('assigned')}:</strong> {(() => {
                    const d = toSafeDate(task.createdAt) || toSafeDate(task.updatedAt) || toSafeDate(task.startedAt);
                    return d ? formatDateTime(d) : 'N/A';
                  })()}</div>
                  <div><strong>{t('assignedBy')}:</strong> {task.assignedById ? users.find(u => u.id === task.assignedById)?.name || 'Unknown' : 'Unknown'}</div>
                  {showAssignedUsers && (
                    <div><strong>{t('assignedTo')}:</strong> {task.assignedUserIds?.map(id => users.find(u => u.id === id)?.name).filter(Boolean).join(', ') || t('noUsersAssigned') || 'No users assigned'}</div>
                  )}
                  {task.targetDate && (
                    <div><strong>{t('targetDate')}:</strong> {formatDateOnly(task.targetDate)}</div>
                  )}
                  <div><strong>{t('started')}:</strong> {(() => {
                    const d = toSafeDate(task.startedAt);
                    return d ? formatDateTime(d) : 'N/A';
                  })()}</div>
                  <div><strong>{t('completed')}:</strong> {(() => {
                    const d = toSafeDate(task.completedAt);
                    return d ? formatDateTime(d) : 'N/A';
                  })()}</div>
                  {task.notes && Array.isArray(task.notes) && task.notes.length > 0 && (
                    <div>
                      <strong>{t('notes')}:</strong>
                      <ul className="list-disc list-inside pl-2 text-xs">
                        {task.notes.map((n, i) => (
                          <li key={i}>{n.text} ({n.type})</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {task.status === STATUSES.DELETED && task.deleteReason && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <strong className="text-red-800 text-sm">🗑️ Deletion Reason:</strong>
                      <p className="text-red-700 text-xs mt-1">{task.deleteReason}</p>
                    </div>
                  )}
                  {/* Progressive photo loading - only show when expanded and loaded */}
                  {task.photos?.length > 0 && loadedPhotos.has(task.id) && (
                    <div className="mt-3">
                      <strong className="text-sm text-slate-700">Photos ({task.photos.length})</strong>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                        {task.photos.map((p, i) => (
                          <img 
                            key={i} 
                            src={p} 
                            alt={`photo ${i + 1}`} 
                            className="h-24 w-full object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity" 
                            onClick={() => handlePhotoClick(p, task.title)}
                            title="Click to view full size"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Show loading placeholder for photos */}
                  {task.photos?.length > 0 && !loadedPhotos.has(task.id) && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-1">
                      {task.photos.map((_, i) => (
                        <div key={i} className="h-24 w-full bg-slate-200 rounded-lg animate-pulse"></div>
                      ))}
                    </div>
                  )}
                  
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Head' || task.assignedById === currentUser?.id) && (
                    <button onClick={(e) => { e.stopPropagation(); setEditingTask(task); }} className="btn btn-xs btn-secondary mt-2">✏️ {t('editTask')}</button>
                  )}
                </div>
              </TaskEditor>
            ) : null}
          />
        ))}
        {sortedTasks.length === 0 && (
          <li className="rounded-xl border border-dashed p-6 text-center text-slate-500 bg-white">
            <div className="text-2xl">🎉</div>
            <div className="mt-1 font-medium">{t('noTasksFriendly')}</div>
            <div className="text-xs">{t('noTasksSub')}</div>
          </li>
        )}
      </ul>

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
          onSave={(updated) => { onUpdateTask(updated); setEditingTask(null); }}
          onDelete={async (taskId) => { if (deleteTask) { await deleteTask(taskId); setEditingTask(null); } }}
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
      
      {/* Photo Modal */}
      {photoModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoModal({ isOpen: false, photo: null, title: '' })}>
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white p-4 flex justify-between items-center">
              <h3 className="text-lg font-semibold truncate">{photoModal.title}</h3>
              <button 
                onClick={() => setPhotoModal({ isOpen: false, photo: null, title: '' })}
                className="text-white hover:text-brand-100 transition-colors p-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            {/* Photo with Zoom Controls */}
            <div className="p-4 flex flex-col items-center">
              {/* Zoom Controls */}
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={handleZoomOut}
                  className="px-3 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  title="Zoom Out"
                >
                  🔍-
                </button>
                <span className="text-sm text-gray-600 min-w-[60px] text-center">
                  {Math.round(photoZoom * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="px-3 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  title="Zoom In"
                >
                  🔍+
                </button>
                <button
                  onClick={handleResetZoom}
                  className="px-3 py-1 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  title="Reset Zoom"
                >
                  🔄
                </button>
              </div>
              
              {/* Zoomable Image Container */}
              <div 
                className="relative overflow-hidden rounded-lg shadow-lg cursor-move"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: photoZoom > 1 ? 'grab' : 'default' }}
              >
                <img 
                  src={photoModal.photo} 
                  alt="" 
                  className="transition-transform duration-200 ease-out"
                  style={{
                    transform: `scale(${photoZoom}) translate(${photoPosition.x / photoZoom}px, ${photoPosition.y / photoZoom}px)`,
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain'
                  }}
                  draggable={false}
                />
              </div>
              
              {/* Zoom Instructions */}
              <div className="mt-2 text-xs text-gray-500 text-center">
                {photoZoom > 1 ? 'Drag to pan • Scroll to zoom • Click reset to return' : 'Scroll to zoom • Drag to pan when zoomed'}
              </div>
            </div>
            
            {/* Footer */}
            <div className="bg-slate-50 p-4 text-center">
              <p className="text-sm text-slate-600">Click outside or press ESC to close</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}