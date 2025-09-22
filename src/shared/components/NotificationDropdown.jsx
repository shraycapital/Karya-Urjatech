import React, { useState, useEffect, useRef } from 'react';

export default function NotificationDropdown({ 
  notifications = [], 
  onMarkAsRead, 
  onRemoveNotification, 
  onClearAll, 
  isOpen, 
  onClose, 
  t 
}) {
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasNotifications = notifications.length > 0;

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'newTask':
        return '📋';
      case 'deadlineReminder':
        return '⏰';
      case 'taskCompleted':
        return '✅';
      default:
        return '🔔';
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {t('notifications')} {unreadCount > 0 && `(${unreadCount})`}
          </h3>
          {hasNotifications && (
            <button
              onClick={onClearAll}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {t('clearAll')}
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="max-h-80 overflow-y-auto">
        {!hasNotifications ? (
          <div className="px-4 py-8 text-center text-gray-500">
            <div className="text-2xl mb-2">🔔</div>
            <p className="text-sm">{t('noNotifications')}</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                !notification.read ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="text-lg flex-shrink-0">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <h4 className={`text-sm font-medium ${
                      !notification.read ? 'text-gray-900' : 'text-gray-700'
                    }`}>
                      {notification.title}
                    </h4>
                    <button
                      onClick={() => onRemoveNotification(notification.id)}
                      className="text-gray-400 hover:text-gray-600 text-xs ml-2"
                      title={t('remove')}
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {notification.message}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">
                      {formatTimestamp(notification.timestamp)}
                    </span>
                    {!notification.read && (
                      <button
                        onClick={() => onMarkAsRead(notification.id)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {t('markAsRead')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {hasNotifications && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <div className="text-xs text-gray-500 text-center">
            {unreadCount > 0 ? (
              <span>{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</span>
            ) : (
              <span>All notifications read</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
