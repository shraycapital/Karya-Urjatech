import React, { useMemo, useState } from 'react';

export default function BulkDeleteTasksModal({ isOpen, onClose, onConfirm, tasks = [], t }) {
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const previewTasks = useMemo(() => tasks.slice(0, 5), [tasks]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!deleteReason.trim()) {
      alert(t('deleteReasonRequired') || 'Please provide a reason for deleting these tasks.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm(deleteReason.trim());
      setDeleteReason('');
      onClose();
    } catch (error) {
      console.error('Error bulk deleting tasks:', error);
      alert(t('deleteTaskError') || 'Failed to delete tasks. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setDeleteReason('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-red-500">🗑️</span>
            {t('bulkDeleteTasks', 'Bulk Delete Tasks')}
          </h3>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <div className="mb-4">
              <p className="text-gray-700 mb-2">
                {t('bulkDeleteConfirmation', `Are you sure you want to delete ${tasks.length} selected tasks?`)}
              </p>
              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="font-medium text-gray-900">
                  {tasks.length} {t('tasks', 'tasks')} {t('selected', 'selected')}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  {previewTasks.map((task) => (
                    <li key={task.id} className="truncate">
                      • {task.title || t('untitledTask', 'Untitled task')}
                    </li>
                  ))}
                  {tasks.length > previewTasks.length && (
                    <li className="text-xs text-gray-500">
                      +{tasks.length - previewTasks.length} {t('more', 'more')}
                    </li>
                  )}
                </ul>
              </div>
              <p className="text-sm text-gray-600 mb-3">
                {t('bulkDeleteTaskNote', 'These tasks will be marked as deleted and hidden from users, but will remain visible to administrators. The same reason will be added to all selected tasks.')}
              </p>
            </div>

            <div className="mb-4">
              <label htmlFor="bulkDeleteReason" className="block text-sm font-medium text-gray-700 mb-2">
                {t('deleteReason') || 'Reason for deletion'} <span className="text-red-500">*</span>
              </label>
              <textarea
                id="bulkDeleteReason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t('deleteReasonPlaceholder') || 'Please explain why these tasks are being deleted...'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                rows={3}
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('deleteReasonHelp') || 'This reason will be added to the task notes and logged for audit purposes.'}
              </p>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
            >
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !deleteReason.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span className="flex items-center">
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                  {t('deleting') || 'Deleting...'}
                </span>
              ) : (
                t('deleteSelectedTasks', 'Delete Selected Tasks')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
