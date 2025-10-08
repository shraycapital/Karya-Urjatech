import React from 'react';
import AdminComments from './AdminComments.jsx';

export default function TaskEditor({ children, task, onRequestMaterial, hasBlockingTasks, blockingTasks, onAddComment, comments = [], t, currentUser, onDeleteComment, isLoadingComments = false }) {
  return (
    <div className="border-t p-3 text-sm space-y-3">
      {/* Blocking Tasks Warning */}
      {hasBlockingTasks && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-red-700 font-semibold">
            <span>🚫 {t('taskBlocked') || 'Task Blocked'}</span>
          </div>

          <div className="space-y-2">
            {blockingTasks.map((blockingTask) => (
              <div key={blockingTask.id} className="flex items-center justify-between p-2 rounded border border-red-200 bg-white">
                <div className="flex-1">
                  <div className="font-semibold text-red-800">{blockingTask.title}</div>
                  <div className="text-xs text-slate-600 mt-1">
                    <span className="font-medium">{t('assignedTo') || 'Assigned to'}:</span> {blockingTask.assignedUserIds?.map(id => 
                      blockingTask.users?.find(u => u.id === id)?.name || 'Unknown'
                    ).join(', ') || 'Unknown'}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    {t('created') || 'Created'}: {blockingTask.createdAt || blockingTask.timestamp ? new Date(blockingTask.createdAt || blockingTask.timestamp).toLocaleDateString() : 'Unknown date'}
                  </div>
                </div>
                <span className={`badge ${
                  blockingTask.status === 'Complete' ? 'badge-success' : 
                  blockingTask.status === 'Ongoing' ? 'badge-info' : 'badge-warn'
                }`}>
                  {blockingTask.status}
                </span>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-700">
            {t('whatToDo') || 'What to do'}: {t('completeRequestsFirst') || 'Complete the above requests to enable finishing this task.'}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <button
          onClick={onRequestMaterial}
          className="btn btn-xs btn-secondary"
          title={t('requestMaterialInfo') || 'Request material/info'}
        >
          📋 {t('requestMaterialInfo') || 'Request material/info'}
        </button>
        
        <button
          onClick={onAddComment}
          className="btn btn-xs btn-outline"
          title="Add a comment to this task"
        >
          💬 Add Comment
        </button>
      </div>

      {/* Original Content */}
      {children}

      {/* Comments Section - Moved to bottom */}
      {(comments.length > 0 || isLoadingComments) && (
        <div className="border-t pt-3">
          <AdminComments 
            comments={comments} 
            t={t} 
            currentUser={currentUser}
            onDeleteComment={onDeleteComment}
            taskId={task?.id}
            isLoadingComments={isLoadingComments}
          />
        </div>
      )}
    </div>
  );
}


