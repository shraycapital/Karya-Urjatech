import React, { useState } from 'react';

function UnfinishedModal({ task, onClose, onConfirm, t }) {
  const [note, setNote] = useState('');

  const handleSubmit = () => { onConfirm(task.id, { note }); };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-amber-700">{t('markAsUnfinished', 'Mark as Unfinished')}: {task.title}</h3>
        <p className="text-sm text-slate-600">
          {t('unfinishedWarning', 'This will close the task without awarding points. You can reopen it later if needed.')}
        </p>
        
        <textarea 
          value={note} 
          onChange={(e) => setNote(e.target.value)} 
          placeholder={t('unfinishedReason', 'Reason for closing (optional)...')} 
          className="input text-sm" 
          rows="3"
        ></textarea>
        
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary btn-sm">{t('cancel')}</button>
          <button onClick={handleSubmit} className="btn btn-warning btn-sm text-white">{t('confirm')}</button>
        </div>
      </div>
    </div>
  );
}

export default UnfinishedModal;




