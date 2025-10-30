import React, { useState, useEffect, useMemo } from 'react';
import { STATUSES } from '../../../shared/constants';
import { DIFFICULTY_LEVELS, DIFFICULTY_CONFIG } from '../../../shared/constants';
import { toISTISOString } from '../../../shared/utils/date';
import DeleteTaskModal from './DeleteTaskModal';

export default function EditTaskModal({ task, onClose, onSave, onDelete, users, departments, currentUser, t }) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Helper function to extract date only from targetDate
  const extractDateOnly = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const [editedTask, setEditedTask] = useState({
    title: task.title || '',
    description: task.description || '',
    status: task.status || STATUSES.PENDING,
    difficulty: task.difficulty || DIFFICULTY_LEVELS.MEDIUM,
    targetDate: extractDateOnly(task.targetDate),
    assignedUserIds: task.assignedUserIds || [],
    departmentId: task.departmentId || '',
    notes: task.notes || [],
    isUrgent: task.isUrgent || false, // Add urgent state
    isRdNewSkill: task.isRdNewSkill || false, // Add R&D/New Skill state
    projectSkillName: task.projectSkillName || '', // Add project/skill name state
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [photos, setPhotos] = useState(task.photos || []);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);

  // Get available users for the selected department
  const availableUsers = useMemo(() => {
    if (!editedTask.departmentId) return [];
    return users.filter((u) => u.departmentIds?.includes(editedTask.departmentId));
  }, [users, editedTask.departmentId]);

  useEffect(() => {
    setEditedTask({
      title: task.title || '',
      description: task.description || '',
      status: task.status || STATUSES.PENDING,
      difficulty: task.difficulty || DIFFICULTY_LEVELS.MEDIUM,
      targetDate: extractDateOnly(task.targetDate),
      assignedUserIds: task.assignedUserIds || [],
      departmentId: task.departmentId || '',
      notes: task.notes || [],
      isUrgent: task.isUrgent || false,
      isRdNewSkill: task.isRdNewSkill || false,
      projectSkillName: task.projectSkillName || ''
    });
    setPhotos(task.photos || []);
  }, [task]);

  const handleUserCheckboxChange = (userId) => {
    setEditedTask(prev => ({
      ...prev,
      assignedUserIds: prev.assignedUserIds.includes(userId) 
        ? prev.assignedUserIds.filter(id => id !== userId)
        : [...prev.assignedUserIds, userId]
    }));
  };

  const handlePhotoChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setIsPhotoUploading(true);

    const compressAndResizeImage = (file) => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
          // Calculate dimensions for mobile optimization (800x600 max)
          let { width, height } = img;
          const maxWidth = 800;
          const maxHeight = 600;
          
          if (width > maxWidth || height > maxHeight) {
            const aspectRatio = width / height;
            if (width > height) {
              width = maxWidth;
              height = maxWidth / aspectRatio;
            } else {
              height = maxHeight;
              width = maxHeight * aspectRatio;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(compressedDataUrl);
        };
        
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    };

    const processFiles = async (filesToProcess) => {
      const compressedPhotos = [];
      for (const file of filesToProcess) {
        try {
          const compressed = await compressAndResizeImage(file);
          compressedPhotos.push(compressed);
        } catch (error) {
          console.error('Image processing failed for a file, skipping:', error);
        }
      }
      return compressedPhotos;
    };

    processFiles(files).then(newPhotos => {
      setPhotos(prevPhotos => [...prevPhotos, ...newPhotos]);
      setIsPhotoUploading(false);
    });
  };
  
  const removePhoto = (index) => {
    setPhotos(prevPhotos => prevPhotos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Merge description into notes if provided
      let updatedNotes = [...(task.notes || [])];
      if (editedTask.description && editedTask.description.trim()) {
        updatedNotes.push({
          text: editedTask.description.trim(),
          type: 'edit',
          createdAt: toISTISOString(),
          createdBy: currentUser.id,
          editedBy: currentUser.id,
          editedByName: currentUser.name
        });
      }

      const updatedTask = {
        ...task,
        ...editedTask,
        notes: updatedNotes,
        difficulty: editedTask.difficulty,
        points: DIFFICULTY_CONFIG[editedTask.difficulty].points,
        photos: photos,
        updatedAt: toISTISOString(),
        updatedById: currentUser.id
      };

      await onSave(updatedTask);
      
      // If this is a Head/Admin/Management editing a task that needs approval,
      // automatically approve it since they don't need approval themselves
      if (task.needsApproval && !task.approvedBy && !task.rejectedBy) {
        const isApprover = currentUser.role === 'Head' || currentUser.role === 'Management' || currentUser.role === 'Admin';
        if (isApprover) {
          // Auto-approve the task
          const approvedTask = {
            ...updatedTask,
            needsApproval: false,
            approvedBy: currentUser.id,
            approvedByName: currentUser.name,
            approvedAt: new Date().toISOString()
          };
          await onSave(approvedTask);
        }
      }
      
      // Close modal after successful save
      onClose();
    } catch (error) {
      console.error('Error updating task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async (deleteReason) => {
    try {
      await onDelete(task.id, deleteReason);
      onClose();
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error; // Re-throw to let the modal handle the error
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              ✏️ {t('editTask') || 'Edit Task'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-2">
                {t('taskTitle') || 'Task Title'}
              </label>
              <input
                type="text"
                id="title"
                value={editedTask.title}
                onChange={(e) => setEditedTask(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              />
            </div>

            {/* Status */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-2">
                {t('status') || 'Status'}
              </label>
              <select
                id="status"
                value={editedTask.status}
                onChange={(e) => setEditedTask(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              >
                <option value={STATUSES.PENDING}>{t('pending') || 'Pending'}</option>
                <option value={STATUSES.ONGOING}>{t('ongoing') || 'Ongoing'}</option>
                <option value={STATUSES.COMPLETE}>{t('completed') || 'Completed'}</option>
              </select>
            </div>

            {/* Task Difficulty Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('taskDifficulty')}</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setEditedTask(prev => ({ ...prev, difficulty: key }))}
                    className={`px-2 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      editedTask.difficulty === key
                        ? `${config.color} shadow-sm scale-105`
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <span className="mr-1">{config.icon}</span>
                    {t(config.label.toLowerCase())} ({config.points} pts)
                    <div className="text-xs opacity-75">{config.timeEstimate}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Urgent Task Checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isUrgent"
                checked={editedTask.isUrgent}
                onChange={(e) => setEditedTask(prev => ({ ...prev, isUrgent: e.target.checked }))}
                className="mr-2 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700">
                {t('urgentTask') || 'Urgent Task'}
              </label>
            </div>

            {/* R&D/New Skill Checkbox */}
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isRdNewSkill"
                checked={editedTask.isRdNewSkill}
                onChange={(e) => setEditedTask(prev => ({ ...prev, isRdNewSkill: e.target.checked }))}
                className="mr-2 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <label htmlFor="isRdNewSkill" className="text-sm text-gray-700">
                R&D/New Skill (5x EP, 50% LP)
              </label>
            </div>

            {/* Project/Skill Name Field - Only show when R&D is selected */}
            {editedTask.isRdNewSkill && (
              <div className="mt-2">
                <label htmlFor="projectSkillName" className="block text-sm font-medium text-gray-700 mb-1">
                  Project/Skill Name (Optional)
                </label>
                <input
                  type="text"
                  id="projectSkillName"
                  value={editedTask.projectSkillName}
                  onChange={(e) => setEditedTask(prev => ({ ...prev, projectSkillName: e.target.value }))}
                  placeholder="Enter project or skill name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Department Selection */}
            {(() => {
              const userDepartments = currentUser.departmentIds?.length > 1 
                ? departments.filter(d => currentUser.departmentIds.includes(d.id))
                : currentUser.role === 'Admin' 
                  ? departments 
                  : [];
              
              const canSelectDepartment = userDepartments.length > 1 || currentUser.role === 'Admin';
              
              return canSelectDepartment ? (
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-2">
                    {t('department') || 'Department'}
                  </label>
                  <select
                    id="department"
                    value={editedTask.departmentId}
                    onChange={(e) => {
                      setEditedTask(prev => ({ 
                        ...prev, 
                        departmentId: e.target.value,
                        assignedUserIds: [] // Clear assigned users when department changes
                      }));
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">{t('selectDepartment') || 'Select Department'}</option>
                    {userDepartments.map((dept) => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              ) : editedTask.departmentId ? (
                <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded border">
                  {t('department')}: {departments.find(d => d.id === editedTask.departmentId)?.name || t('unknown')}
                </div>
              ) : null;
            })()}

            {/* Assigned Users */}
            {editedTask.departmentId && (
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('assignedTo') || 'Assigned To'}
                </label>
                <button
                  type="button"
                  onClick={() => setAssigneeOpen(!assigneeOpen)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {editedTask.assignedUserIds.length > 0 
                    ? editedTask.assignedUserIds.map(id => availableUsers.find(u => u.id === id)?.name).filter(Boolean).join(', ')
                    : t('selectUsers') || 'Select users'
                  }
                </button>
                
                {assigneeOpen && (
                  <div className="absolute z-20 bg-white border border-gray-300 rounded-md shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
                    {availableUsers.map((user) => (
                      <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editedTask.assignedUserIds.includes(user.id)}
                          onChange={() => handleUserCheckboxChange(user.id)}
                          className="mr-2"
                        />
                        {user.name}
                      </label>
                    ))}
                    {availableUsers.length === 0 && (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {t('noUsersInDept') || 'No users in this department'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Target Date */}
            <div>
              <label htmlFor="targetDate" className="block text-sm font-medium text-gray-700 mb-2">
                {t('targetDate') || 'Target Date'}
              </label>
              <input
                type="date"
                id="targetDate"
                value={editedTask.targetDate}
                onChange={(e) => setEditedTask(prev => ({ ...prev, targetDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                {t('notes') || 'Notes'}
              </label>
              <textarea
                id="description"
                rows={3}
                value={editedTask.description || ''}
                onChange={(e) => setEditedTask(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                placeholder={t('addNotePlaceholder') || 'Add a note...'}
              />
              
              {/* Show previous notes */}
              {task.notes && Array.isArray(task.notes) && task.notes.length > 0 && (
                <div className="mt-2 p-2 bg-gray-50 rounded border">
                  <div className="text-xs text-gray-600 mb-1">Previous notes:</div>
                  {task.notes.map((note, index) => (
                    <div key={index} className="text-xs text-gray-700 mb-1">
                      • {note?.text || 'No text available'} ({note?.type || 'unknown'})
                      {note?.editedByName && (
                        <span className="text-gray-500 ml-1">- edited by {note?.editedByName}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* File Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attached Files
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-24 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove photo"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">{t('addPhoto') || 'Add Photo'}</label>
              <div className="flex gap-2">
                <input 
                  type="file" 
                  accept="image/*" 
                  capture="environment" 
                  onChange={handlePhotoChange} 
                  className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" 
                  title="Take photo with camera or select from gallery"
                  disabled={isSubmitting || isPhotoUploading}
                  multiple // Allow multiple files
                />
              </div>
            </div>
            
            {isPhotoUploading && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                Optimizing photos...
              </div>
            )}
            
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              {t('delete') || 'Delete'}
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={isSubmitting || isPhotoUploading}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPhotoUploading ? (
                  <span className="flex items-center">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Processing...
                  </span>
                ) : isSubmitting ? (
                  t('saving') || 'Saving...'
                ) : (
                  t('save') || 'Save'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Task Modal */}
      <DeleteTaskModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        taskTitle={task.title}
        t={t}
      />
    </div>
  );
}
