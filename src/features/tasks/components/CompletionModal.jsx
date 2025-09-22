import React, { useState } from 'react';

function CompletionModal({ task, onClose, onConfirm, t }) {
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Image compression and resizing for mobile optimization
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

    // Process the image
    compressAndResizeImage(file)
      .then((compressedPhoto) => {
        setPhoto(compressedPhoto);
      })
      .catch((error) => {
        console.error('Image processing failed:', error);
        // Fallback to original file if compression fails
        const reader = new FileReader();
        reader.onloadend = () => setPhoto(reader.result);
        reader.readAsDataURL(file);
      });
  };

  const handleSubmit = () => { onConfirm(task.id, { note, photo }); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold">{t('completeTask')}: {task.title}</h3>
        {task.isUrgent && (
          <div className="text-red-600 font-medium flex items-center gap-2">🚨 {t('urgent')}</div>
        )}
        {task.targetDate && (
          <div className="text-slate-600 text-sm">📅 {t('targetDate')}: {new Date(task.targetDate).toLocaleDateString()}</div>
        )}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('completionNotePlaceholder')} className="input text-sm" rows="3"></textarea>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">{t('addPhoto')}</label>
          <div className="flex gap-2">
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
          </div>
          <div className="text-xs text-slate-500">💡 {`On mobile, this will open your camera.`}</div>
        </div>
        {photo && <img src={photo} alt="" className="mt-2 h-24 w-24 object-cover rounded-lg border" />}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary btn-sm">{t('cancel')}</button>
          <button onClick={handleSubmit} className="btn btn-success btn-sm">{t('confirm')}</button>
        </div>
      </div>
    </div>
  );
}

export default CompletionModal;

