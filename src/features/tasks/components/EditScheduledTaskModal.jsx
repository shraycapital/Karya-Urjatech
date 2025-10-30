import React, { useState, useEffect } from 'react';
import { DIFFICULTY_LEVELS, DIFFICULTY_CONFIG } from '../../../shared/constants';
import RecurrencePattern from './RecurrencePattern';

const CloseIcon = ({ size = 16, className = '' }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

export default function EditScheduledTaskModal({ 
  scheduledTask, 
  users, 
  departments, 
  currentUser, 
  onSave, 
  onCancel, 
  t = (key) => key 
}) {
  const [editedTask, setEditedTask] = useState({
    title: scheduledTask.title || '',
    description: scheduledTask.description || '',
    difficulty: scheduledTask.difficulty || DIFFICULTY_LEVELS.MEDIUM,
    assignedUserIds: scheduledTask.assignedUserIds || [],
    departmentId: scheduledTask.departmentId || '',
    targetDate: scheduledTask.targetDate || null,
    isUrgent: scheduledTask.isUrgent || false,
    isRdNewSkill: scheduledTask.isRdNewSkill || false,
    projectSkillName: scheduledTask.projectSkillName || '',
    recurrencePattern: scheduledTask.recurrencePattern || null,
    isActive: scheduledTask.isActive !== undefined ? scheduledTask.isActive : true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [errors, setErrors] = useState({});

  // Get available users for the selected department
  const availableUsers = users.filter((u) => 
    editedTask.departmentId && u.departmentIds?.includes(editedTask.departmentId)
  );

  // Initialize RecurrencePattern with existing data
  useEffect(() => {
    if (scheduledTask.recurrencePattern) {
      setEditedTask(prev => ({
        ...prev,
        recurrencePattern: scheduledTask.recurrencePattern
      }));
    }
  }, [scheduledTask.recurrencePattern]);

  const handleUserCheckboxChange = (userId) => {
    setEditedTask(prev => ({
      ...prev,
      assignedUserIds: prev.assignedUserIds.includes(userId)
        ? prev.assignedUserIds.filter(id => id !== userId)
        : [...prev.assignedUserIds, userId]
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!editedTask.title.trim()) {
      newErrors.title = 'Title is required';
    }
    
    if (!editedTask.departmentId) {
      newErrors.departmentId = 'Department is required';
    }
    
    if (!editedTask.assignedUserIds.length) {
      newErrors.assignedUserIds = 'At least one assignee is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Clean the data to remove undefined values
      const cleanedTask = Object.fromEntries(
        Object.entries(editedTask).filter(([key, value]) => value !== undefined)
      );
      
      // Ensure required fields have proper values
      const taskToSave = {
        ...cleanedTask,
        title: editedTask.title || '',
        description: editedTask.description || '',
        difficulty: editedTask.difficulty || DIFFICULTY_LEVELS.MEDIUM,
        assignedUserIds: editedTask.assignedUserIds || [],
        departmentId: editedTask.departmentId || '',
        isUrgent: editedTask.isUrgent || false,
        isRdNewSkill: editedTask.isRdNewSkill || false,
        projectSkillName: editedTask.isRdNewSkill ? (editedTask.projectSkillName || '') : '',
        isActive: editedTask.isActive !== undefined ? editedTask.isActive : true,
        recurrencePattern: editedTask.recurrencePattern || null,
        targetDate: editedTask.targetDate || null
      };

      await onSave(taskToSave);
    } catch (error) {
      console.error('Error saving scheduled task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">Edit Scheduled Task</h3>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            <CloseIcon size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Task Title *
            </label>
            <input
              type="text"
              id="title"
              value={editedTask.title}
              onChange={(e) => setEditedTask(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.title ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter task title..."
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              value={editedTask.description}
              onChange={(e) => setEditedTask(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter task description..."
            />
          </div>

          {/* Department Selection */}
          <div>
            <label htmlFor="department" className="block text-sm font-medium text-gray-700 mb-1">
              Department *
            </label>
            <select
              id="department"
              value={editedTask.departmentId}
              onChange={(e) => setEditedTask(prev => ({ 
                ...prev, 
                departmentId: e.target.value,
                assignedUserIds: [] // Reset assignees when department changes
              }))}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.departmentId ? 'border-red-500' : 'border-gray-300'
              }`}
            >
              <option value="">Select Department</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
            {errors.departmentId && <p className="text-red-500 text-xs mt-1">{errors.departmentId}</p>}
          </div>

          {/* Assignees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assignees *
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAssigneeOpen(!assigneeOpen)}
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-left ${
                  errors.assignedUserIds ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                {editedTask.assignedUserIds.length === 0
                  ? 'Select assignees...'
                  : editedTask.assignedUserIds.length === 1
                    ? users.find(u => u.id === editedTask.assignedUserIds[0])?.name || 'Unknown'
                    : `${editedTask.assignedUserIds.length} users selected`
                }
              </button>
              
              {assigneeOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {availableUsers.map((user) => (
                    <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editedTask.assignedUserIds.includes(user.id)}
                        onChange={() => handleUserCheckboxChange(user.id)}
                        className="mr-2"
                      />
                      <span className="text-sm">{user.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {errors.assignedUserIds && <p className="text-red-500 text-xs mt-1">{errors.assignedUserIds}</p>}
          </div>

          {/* Difficulty */}
          <div>
            <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
              Difficulty
            </label>
            <select
              id="difficulty"
              value={editedTask.difficulty}
              onChange={(e) => setEditedTask(prev => ({ ...prev, difficulty: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Object.entries(DIFFICULTY_LEVELS).map(([key, value]) => (
                <option key={key} value={value}>
                  {DIFFICULTY_CONFIG[value]?.label} ({DIFFICULTY_CONFIG[value]?.points} pts)
                </option>
              ))}
            </select>
          </div>

          {/* Target Date */}
          <div>
            <label htmlFor="targetDate" className="block text-sm font-medium text-gray-700 mb-1">
              Target Date
            </label>
            <input
              type="date"
              id="targetDate"
              value={editedTask.targetDate ? new Date(editedTask.targetDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setEditedTask(prev => ({ 
                ...prev, 
                targetDate: e.target.value ? new Date(e.target.value).toISOString() : null 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isUrgent"
                checked={editedTask.isUrgent}
                onChange={(e) => setEditedTask(prev => ({ ...prev, isUrgent: e.target.checked }))}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isUrgent" className="text-sm text-gray-700">
                Urgent Task
              </label>
            </div>

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

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={editedTask.isActive}
                onChange={(e) => setEditedTask(prev => ({ ...prev, isActive: e.target.checked }))}
                className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">
                Active (will generate tasks)
              </label>
            </div>
          </div>

          {/* Recurrence Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recurrence Pattern
            </label>
            <RecurrencePattern
              isScheduled={true}
              onRecurrenceChange={(pattern) => setEditedTask(prev => ({ ...prev, recurrencePattern: pattern }))}
              startDate={editedTask.targetDate || new Date().toISOString()}
              initialValue={editedTask.recurrencePattern}
              t={t}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
