import React, { useEffect, useMemo, useState } from 'react';
import { toISTDateString } from '../../../shared/utils/date';
import { DIFFICULTY_LEVELS, DIFFICULTY_CONFIG } from '../../../shared/constants';
import RecurrencePattern from './RecurrencePattern';

const ROLES = { USER: 'User', HEAD: 'Head', ADMIN: 'Admin' };

export default function TaskForm({ currentUser, users, departments, onCreate, t, onCancel }) {
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState(() => {
    return currentUser.departmentIds?.[0] || (departments[0]?.id || '');
  });
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isPhotoUploading, setIsPhotoUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [difficulty, setDifficulty] = useState(DIFFICULTY_LEVELS.MEDIUM); // Default to medium
  const [targetDate, setTargetDate] = useState(() => toISTDateString());
  const [isUrgent, setIsUrgent] = useState(false); // Add urgent state
  const [isScheduled, setIsScheduled] = useState(false); // Add scheduled task state
  const [recurrencePattern, setRecurrencePattern] = useState(null); // Add recurrence pattern state
  const [errors, setErrors] = useState({});

  const availableUsers = useMemo(() => {
    if (!dept) return [];
    return users.filter((u) => u.departmentIds?.includes(dept));
  }, [users, dept]);

  useEffect(() => {
    if (assignedUserIds.length > 0) return;
    const raw = localStorage.getItem('kartavya_lastAssignees');
    if (raw) {
      try {
        const remembered = JSON.parse(raw);
        const valid = remembered.filter((id) => availableUsers.some((u) => u.id === id));
        if (valid.length > 0) { setAssignedUserIds(valid); return; }
      } catch {}
    }
    const self = availableUsers.find((u) => u.id === currentUser.id);
    if (self) setAssignedUserIds([self.id]);
    else if (availableUsers[0]) setAssignedUserIds([availableUsers[0].id]);
  }, [availableUsers]);

  const handleUserCheckboxChange = (userId) => {
    setAssignedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
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
          try {
            // Set maximum dimensions for mobile optimization
            const maxWidth = 800;
            const maxHeight = 600;
            
            let { width, height } = img;
            
            // Calculate new dimensions maintaining aspect ratio
            if (width > height && width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            } else if (height >= width && height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
            
            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;
            
            // Draw resized image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to compressed data URL
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressedDataUrl);
          } catch (error) {
            reject(error);
          }
        };
        
        img.onerror = () => reject(new Error('Failed to load image'));
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
          // Optionally, handle fallback to reader here for individual files if needed
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    // Robust check for currentUser before submission
    if (!currentUser || !currentUser.id || !currentUser.name) {
      alert(t('userDataNotLoadedError') || 'Your user data is not fully loaded. Please wait a moment and try again. If the problem persists, please re-login.');
      return;
    }

    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Task name required';
    if (assignedUserIds.length === 0) nextErrors.assignees = 'Select at least one assignee';
    if (!dept) nextErrors.department = 'Department is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setIsSubmitting(true);
    try {
      await onCreate({
        title: title.trim(),
        assignedUserIds,
        assignedById: currentUser.id,
        assignedUserRole: currentUser.role, // Pass user role for approval logic
        departmentId: dept,
        difficulty,
        points: DIFFICULTY_CONFIG[difficulty].points,
        targetDate: targetDate || toISTDateString(),
        status: 'Pending',
        notes: note.trim() ? [{ text: note.trim(), type: 'creation' }] : [],
        photos: photos,
        isUrgent, // Include isUrgent in submission
        isScheduled, // Include scheduled task flag
        recurrencePattern, // Include recurrence pattern
        scheduledStartDate: isScheduled ? targetDate : null, // Set start date for scheduled tasks
      });
      try { localStorage.setItem('kartavya_lastAssignees', JSON.stringify(assignedUserIds)); } catch {}
      setTitle(''); setNote(''); setPhotos([]); setAssignedUserIds([]); setAssigneeOpen(false); setDifficulty(DIFFICULTY_LEVELS.MEDIUM); setTargetDate(toISTDateString()); setIsUrgent(false); setIsScheduled(false); setRecurrencePattern(null);
      onCancel(); // Close the modal after successful creation
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mt-3">
      <div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('taskTitle')} className={`input ${errors.title ? 'border-red-500 ring-2 ring-red-300' : ''}`} />
        {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
      </div>
      
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('addNotePlaceholder')} className="input text-sm" rows="2"></textarea>
      
      {/* Department Selection - Available for users with multiple departments or Admins */}
      {(() => {
        const userDepartments = currentUser.departmentIds?.length > 1 
          ? departments.filter(d => currentUser.departmentIds.includes(d.id))
          : currentUser.role === ROLES.ADMIN 
            ? departments 
            : [];
        
        const canSelectDepartment = userDepartments.length > 1 || currentUser.role === ROLES.ADMIN;
        
        return canSelectDepartment ? (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('department')}</label>
            <select 
              value={dept} 
              onChange={(e) => {
                setDept(e.target.value);
                setAssignedUserIds([]); // Clear assigned users when department changes
              }} 
              className="select"
            >
              {userDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {errors.department && <p className="text-xs text-red-600 mt-1">{errors.department}</p>}
          </div>
        ) : dept ? (
          <div className="text-sm text-slate-600 p-2 bg-slate-50 rounded border">
            {t('department')}: {departments.find(d => d.id === dept)?.name || t('unknown')}
          </div>
        ) : null;
      })()}
      
      {/* Assigned To Section */}
      <div className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-1">{t('assignedTo')}</label>
        <button type="button" onClick={() => setAssigneeOpen((o) => !o)} className="select text-left hover:bg-slate-50 w-full">
          {assignedUserIds.length > 0 ? assignedUserIds.map(id => availableUsers.find(u => u.id === id)?.name).join(', ') : t('assignedTo')}
        </button>
        {errors.assignees && <p className="text-xs text-red-600 mt-1">{errors.assignees}</p>}
        {assigneeOpen && (
          <div className="absolute z-20 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-y-auto">
            {availableUsers.map((user) => (
              <label key={user.id} className="flex items-center px-3 py-2 hover:bg-gray-100 cursor-pointer">
                <input type="checkbox" checked={assignedUserIds.includes(user.id)} onChange={() => handleUserCheckboxChange(user.id)} className="mr-2" />
                {user.name}
              </label>
            ))}
            {availableUsers.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-500">{t('noUsersInDept')}</div>
            )}
          </div>
        )}
      </div>
      
      {/* Task Difficulty Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">{t('taskDifficulty')}</label>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
            <button
              key={key}
              type="button"
              onClick={() => setDifficulty(key)}
              className={`px-2 py-1.5 rounded-full text-xs font-medium border transition-all ${
                difficulty === key
                  ? `${config.color} shadow-sm scale-105`
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
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
      <div className="flex items-center mt-2">
        <input
          type="checkbox"
          id="isUrgent"
          checked={isUrgent}
          onChange={(e) => setIsUrgent(e.target.checked)}
          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isUrgent" className="text-sm text-slate-700">
          {t('urgentTask')}
        </label>
      </div>

      {/* Scheduled Task Checkbox */}
      <div className="flex items-center mt-2">
        <input
          type="checkbox"
          id="isScheduled"
          checked={isScheduled}
          onChange={(e) => setIsScheduled(e.target.checked)}
          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="isScheduled" className="text-sm text-slate-700">
          {t('scheduledTask') || 'Scheduled Task (Recurring)'}
        </label>
      </div>

      {/* Recurrence Pattern Component */}
      <RecurrencePattern
        isScheduled={isScheduled}
        onRecurrenceChange={setRecurrencePattern}
        startDate={targetDate}
        t={t}
      />
      
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">{t('addPhotos') || 'Add Photos'}</label>
        <div className="flex gap-2">
          <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoChange} className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" title="Take photos with camera or select from gallery" />
        </div>
      </div>
      
      {isPhotoUploading && (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-4 h-4 border-2 border-slate-300 border-t-brand-600 rounded-full animate-spin"></div>
          Optimizing photos for mobile...
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
      
      <div>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="input text-sm w-full" placeholder={t('targetDate')} />
      </div>
      
      <div className="flex items-center justify-end">
        <button type="submit" className={`btn btn-success ${isSubmitting ? 'opacity-75 cursor-not-allowed' : ''}`} disabled={isSubmitting}>
          {isSubmitting ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Creating Task...
            </div>
          ) : (
            t('createTaskBtn')
          )}
        </button>
      </div>
    </form>
  );
}


