import React from 'react';

const AttendanceModal = ({ isOpen, onClose, t }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">📅</span>
            {t('attendance') || 'Attendance'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 text-center">
          {/* Attendance Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="40" 
              height="40" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="white" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          
          {/* Coming Soon Title */}
          <h2 className="text-2xl font-bold text-slate-900 mb-3">
            {t('attendanceComingSoon') || 'Attendance Coming Soon!'}
          </h2>
          
          {/* Description */}
          <p className="text-slate-600 mb-6 leading-relaxed">
            {t('attendanceDescription') || 'We\'re working on an advanced attendance tracking system that will help you manage your work hours, track attendance, and view detailed reports.'}
          </p>
          
          {/* Features Preview */}
          <div className="text-left bg-slate-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-3 text-center">
              {t('attendanceFeatures') || 'What to Expect'}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature1') || 'Check-in and check-out'}
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature2') || 'View attendance history and reports'}
                </span>
              </div>
              <div className="flex items-center">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center mr-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path d="M22 4L12 14.01l-3-3" />
                  </svg>
                </div>
                <span className="text-slate-700">
                  {t('attendanceFeature3') || 'Automatic overtime and break calculations'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Call to Action */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-700 mb-2">
              {t('attendanceCallToAction') || 'Stay tuned for updates on this exciting new feature!'}
            </p>
            <div className="flex items-center justify-center text-xs text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              {t('attendanceStayTuned') || 'Coming soon to Karya!'}
            </div>
          </div>
        </div>
        
        <div className="flex justify-end p-6 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('close') || 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttendanceModal;
