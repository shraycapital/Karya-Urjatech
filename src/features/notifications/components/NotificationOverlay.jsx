import React, { useEffect, useRef } from 'react';

function NotificationOverlay({ notification, onClose, onMarkAsRead, onTaskClick, t }) {
  const overlayRef = useRef(null);

  // Swipe to dismiss
  useEffect(() => {
    let touchstartX = 0;
    let touchendX = 0;

    const handleGesture = () => {
      if (touchendX < touchstartX - 50) { // Swiped left
        onClose();
        onMarkAsRead(notification.id);
      }
      if (touchendX > touchstartX + 50) { // Swiped right
        onClose();
        onMarkAsRead(notification.id);
      }
    };

    const handleTouchStart = (e) => {
      touchstartX = e.changedTouches[0].screenX;
    };
    
    const handleTouchEnd = (e) => {
      touchendX = e.changedTouches[0].screenX;
      handleGesture();
    };

    const overlay = overlayRef.current;
    if (overlay) {
      overlay.addEventListener('touchstart', handleTouchStart, { passive: true });
      overlay.addEventListener('touchend', handleTouchEnd, { passive: true });
    }

    return () => {
      if (overlay) {
        overlay.removeEventListener('touchstart', handleTouchStart);
        overlay.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [notification, onClose, onMarkAsRead]);

  if (!notification) return null;

  // Check if this is a task-related notification
  const isTaskNotification = notification.type === 'newTask' || notification.type === 'deadlineReminder';
  const hasTaskId = notification.taskId;

  const handleNotificationClick = () => {
    if (isTaskNotification && hasTaskId && onTaskClick) {
      onTaskClick(notification.taskId);
      onMarkAsRead(notification.id);
      onClose();
    }
  };

  return (
    <div 
      ref={overlayRef}
      className={`fixed top-4 right-4 w-80 max-w-[90vw] bg-white rounded-lg shadow-lg p-4 z-50 animate-slide-in-right ${
        isTaskNotification && hasTaskId ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''
      }`}
      onClick={handleNotificationClick}
    >
      <div className="flex items-start gap-3">
        <div className="text-blue-500 mt-1">
          {/* Task icon for task notifications, bell for others */}
          {isTaskNotification ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14,2 14,8 20,8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10,9 9,9 8,9"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          )}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{notification.title}</p>
          <p className="text-xs text-slate-600">{notification.message}</p>
          {isTaskNotification && hasTaskId && (
            <p className="text-xs text-blue-600 mt-1 font-medium">Click to view task</p>
          )}
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering the notification click
            onClose();
            onMarkAsRead(notification.id);
          }} 
          className="text-slate-400 hover:text-slate-600"
          aria-label={t('dismiss')}
        >
          &times;
        </button>
      </div>
      <div className="text-center text-xs text-slate-400 mt-2">
        {isTaskNotification && hasTaskId ? 'Click to open task • Swipe to dismiss' : t('swipeToDismiss')}
      </div>
    </div>
  );
}

export default NotificationOverlay;
