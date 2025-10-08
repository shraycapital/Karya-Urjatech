import React from 'react';

export default function AdminComments({ 
  comments = [], 
  t, 
  currentUser, 
  onDeleteComment,
  taskId,
  isLoadingComments = false
}) {
  // Show loading state if comments are being loaded
  if (isLoadingComments) {
    return (
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {t('comments')}
        </h4>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading comments...</span>
        </div>
      </div>
    );
  }
  
  // Only render if there are comments
  if (comments.length === 0) {
    return null;
  }

  const isAdmin = currentUser?.role === 'Admin';

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Are you sure you want to delete this comment? This action cannot be undone.')) {
      return;
    }

    try {
      await onDeleteComment(taskId, commentId);
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment. Please try again.');
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="font-medium text-gray-900 flex items-center gap-2">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {t('comments')} ({comments.length})
      </h4>
      
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment?.id || Math.random()} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-brand-100 rounded-full flex items-center justify-center">
                  <span className="text-xs font-medium text-brand-700">
                    {comment.userName?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <span className="font-medium text-sm text-gray-900">
                  {comment.userName || 'Unknown User'}
                  {comment.editedByName && comment.editedByName !== comment.userName && (
                    <span className="text-xs text-gray-500 ml-1">(edited by {comment.editedByName})</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {comment.createdAt ? `${new Date(comment.createdAt).toLocaleDateString()} ${new Date(comment.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : 'Unknown date'}
                </span>
                {/* Admin Delete Button */}
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteComment(comment?.id)}
                    className="text-red-500 hover:text-red-700 text-xs ml-2 opacity-75 hover:opacity-100 transition-opacity"
                    title="Delete comment (Admin only)"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {comment?.text || 'No text available'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
