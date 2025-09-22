import React, { useState, useEffect, useRef, useMemo } from 'react';
import { STATUSES } from '../../../shared/constants.js';
import { DIFFICULTY_LEVELS, DIFFICULTY_CONFIG } from '../../../shared/constants';
import { toISTDateString } from '../../../shared/utils/date';

export default function RequestModal({ 
  task, 
  onClose, 
  onCreateRequest, 
  departments, 
  users, 
  currentUser, 
  t 
}) {
  const [requestData, setRequestData] = useState({
    description: '',
    departmentId: '',
    assignedUserIds: [],
    expectedDeliveryDate: toISTDateString(), // Default to today in IST
    difficulty: DIFFICULTY_LEVELS.MEDIUM // Default to medium
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [showAssignees, setShowAssignees] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false); // Add urgent state
  const [photos, setPhotos] = useState([]);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  
  const dropdownRef = useRef(null);

  // Include all departments (including the same department for information requests)
  const availableDepartments = departments;

  // Get users from the selected department - using same pattern as TaskForm
  const availableUsers = useMemo(() => {
    if (!requestData.departmentId) return [];
    return users.filter((u) => u.departmentIds?.includes(requestData.departmentId));
  }, [users, requestData.departmentId]);

  // Get the original task's assigned users
  const originalAssignedUsers = users.filter(user => {
    if (!user) return false;
    
    if (task.assignedUserIds && Array.isArray(task.assignedUserIds)) {
      return task.assignedUserIds.includes(user.id);
    } else if (task.assignedUserId) {
      return task.assignedUserId === user.id;
    }
    return false;
  });

  // Auto-select users when department changes - using same pattern as TaskForm
  useEffect(() => {
    if (requestData.assignedUserIds.length > 0) return;
    
    // Try to auto-select original task's assigned users if they're in the selected department
    if (requestData.departmentId && originalAssignedUsers.length > 0) {
      const usersInSelectedDept = originalAssignedUsers.filter(user => 
        user.departmentIds?.includes(requestData.departmentId)
      );
      if (usersInSelectedDept.length > 0) {
        setRequestData(prev => ({
          ...prev,
          assignedUserIds: usersInSelectedDept.map(user => user.id)
        }));
        return;
      }
    }
    
    // Fallback: select first available user (like TaskForm does)
    if (availableUsers.length > 0) {
      setRequestData(prev => ({
        ...prev,
        assignedUserIds: [availableUsers[0].id]
      }));
    }
  }, [availableUsers, requestData.departmentId, originalAssignedUsers]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowAssignees(false);
      }
    };

    if (showAssignees) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAssignees]);

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
    const nextErrors = {};
    if (!requestData.departmentId || requestData.assignedUserIds.length === 0) {
      nextErrors.general = 'Please select a department and assign users for the information request';
    }
    if (!requestData.description || !requestData.description.trim()) {
      nextErrors.description = 'Description is required';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      await onCreateRequest({
        ...requestData,
        originalTaskId: task.id,
        originalTaskTitle: task.title,
        requestingDepartmentId: task.departmentId,
        requestingUserId: currentUser.id,
        requestingUserName: currentUser.name,
        points: DIFFICULTY_CONFIG[requestData.difficulty].points,
        photos: photos,
        isUrgent: isUrgent // Include urgent state
      });
      onClose();
    } catch (error) {
      console.error('Error creating request:', error);
      setErrors({ general: 'Failed to create request. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">
              📋 {t('requestMaterialInfo') || 'Request material/info'}
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
          <p className="text-sm text-gray-600 mt-1">
            {t('requestingFor') || 'Requesting information for'}: <span className="font-medium">{task.title}</span>
          </p>
        </div>

        {/* Request Form - Scrollable */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            {/* Department Selection */}
            <div>
              <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-2">
                {t('requestFromDepartment') || 'Request from Department'}
              </label>
              <select
                id="department"
                value={requestData.departmentId}
                onChange={(e) => {
                  setRequestData(prev => ({ ...prev, departmentId: e.target.value, assignedUserIds: [] }));
                  setShowAssignees(false); // Close the assignees dropdown when department changes
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                required
              >
                <option value="">{t('selectDepartment')}</option>
                {availableDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} {dept.id === task.departmentId ? '(Same Department)' : ''}
                  </option>
                ))}
              </select>
              {requestData.departmentId === task.departmentId && (
                <div className="mt-1 text-xs text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                  💡 This is an internal information request within your department
                </div>
              )}
            </div>

            {/* User Assignment - Exactly like working TaskForm pattern */}
            {requestData.departmentId && (
              <div className="relative" ref={dropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('assignedTo')}
                </label>
                <button 
                  type="button" 
                  onClick={() => setShowAssignees(!showAssignees)} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-left bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {requestData.assignedUserIds.length > 0 
                    ? requestData.assignedUserIds.map(id => availableUsers.find(u => u.id === id)?.name).join(', ')
                    : t('selectUsers') || 'Select users'
                  }
                </button>
                {showAssignees && (
                  <div className="absolute z-20 bg-white border border-gray-300 rounded-md shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
                {availableUsers.map((user) => (
                  <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={requestData.assignedUserIds.includes(user.id)} 
                      onChange={() => {
                        setRequestData(prev => ({
                          ...prev,
                          assignedUserIds: requestData.assignedUserIds.includes(user.id)
                            ? prev.assignedUserIds.filter(id => id !== user.id)
                            : [...prev.assignedUserIds, user.id]
                        }));
                      }} 
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

            {/* Task Difficulty Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('taskDifficulty')}</label>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRequestData(prev => ({ ...prev, difficulty: key }))}
                    className={`px-2 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      requestData.difficulty === key
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
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
                className="mr-2 h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700">
                {t('urgentTask') || 'Urgent Task'}
              </label>
            </div>

            {/* Expected Delivery Date */}
            <div>
              <label htmlFor="expectedDate" className="block text-sm font-medium text-gray-700 mb-2">
                {t('expectedDeliveryDate')}
              </label>
              <input
                type="date"
                id="expectedDate"
                value={requestData.expectedDeliveryDate}
                onChange={(e) => setRequestData(prev => ({ ...prev, expectedDeliveryDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                min={new Date().toISOString().slice(0, 10)}
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
                value={requestData.description}
                onChange={(e) => { setRequestData(prev => ({ ...prev, description: e.target.value })); if (errors.description) setErrors(prev => ({ ...prev, description: undefined })); }}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${errors.description ? 'border-red-400 ring-red-200' : 'border-gray-300'}`}
                placeholder={t('addNotePlaceholder') || 'Add a note...'}
                required
              />
              {errors.description && (
                <p className="text-xs text-red-600 mt-1">{errors.description}</p>
              )}
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">{t('addPhotos') || 'Add Photos'}</label>
              <div className="flex gap-2">
                <input 
                  type="file" 
                  accept="image/*" 
                  multiple
                  capture="environment" 
                  onChange={handlePhotoChange} 
                  className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200" 
                  title="Take photo with camera or select from gallery"
                  disabled={isSubmitting || isPhotoUploading}
                />
              </div>
            </div>
            
            {isPhotoUploading && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                Optimizing photos...
              </div>
            )}
            
            {photos.length > 0 && !isPhotoUploading && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative">
                    <img src={photo} alt={`preview ${index}`} className="h-24 w-24 object-cover rounded-lg border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs"
                      aria-label="Remove photo"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Error Display */}
            {errors.general && (
              <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-200">
                {errors.general}
              </div>
            )}
          </div>
        </form>

        {/* Footer - Fixed at bottom */}
        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPhotoUploading}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 border border-transparent rounded-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSubmit}
            >
              {isPhotoUploading ? 'Processing...' : isSubmitting ? t('creating') : t('createRequest')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

