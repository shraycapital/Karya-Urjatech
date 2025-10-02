import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
import { db, auth, enablePushNotifications, onForegroundMessage } from './firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

import { subscribeTasks, createTask as addTaskData, patchTask as updateTaskData, removeTask as deleteTaskData } from './features/tasks/api/taskApi';
import { useI18n } from './shared/i18n/translations.js';
import Header from './shared/components/Header.jsx';
import LoginScreen from './features/auth/LoginScreen.jsx';
import { ROLES, STATUSES } from './shared/constants.js';
import { canAccessFeature } from './shared/utils/permissions.js';
import Section from './shared/components/Section.jsx';
import NotificationOverlay from './features/notifications/components/NotificationOverlay.jsx';
import { LogOutIcon, SettingsIcon } from './shared/components/Icons.jsx';
import { logActivity } from './shared/utils/activityLogger.js';
import { toISTISOString } from './shared/utils/date';
import { useSmartRefresh } from './shared/hooks/useSmartRefresh.js';
import LocationPermission from './shared/components/LocationPermission.jsx';
import { initializePwaAnalytics, logPwaEvent } from './shared/utils/pwaAnalytics.js';
import RefreshIndicator from './shared/components/RefreshIndicator.jsx';
import { useLocationTracking } from './shared/hooks/useLocationTracking.js';

// Lazy load heavy components
const ActivityLog = lazy(() => import('./features/admin/components/ActivityLog.jsx'));
const AdminPanel = lazy(() => import('./features/admin/components/AdminPanel.jsx'));
const BottomTabs = lazy(() => import('./shared/components/BottomTabs.jsx'));
const TasksTab = lazy(() => import('./features/tasks/components/TasksTab.jsx'));
const PointsTab = lazy(() => import('./features/gamification/components/PointsTab.jsx'));
const DepartmentDashboardTab = lazy(() => import('./features/admin/components/DepartmentDashboardTab.jsx'));
const TaskManagement = lazy(() => import('./features/admin/components/ManagementDashboard.jsx'));
const AnalyticsDashboard = lazy(() => import('./features/analytics/components/AnalyticsDashboard.jsx'));
const ManagementSection = lazy(() => import('./features/admin/components/ManagementSection.jsx'));
const LocationsModal = lazy(() => import('./features/locations/components/LocationsModal.jsx'));
const MarketTab = lazy(() => import('./features/market/components/MarketTab.jsx'));
const AttendanceModal = lazy(() => import('./features/attendance/components/AttendanceModal.jsx'));


// ---------------------- SVG Icons ----------------------

// ---------------------- Constants & Translations ----------------------

// ---------------------- Activity Logging ----------------------

// ---------------------- Auto-save Utilities ----------------------
const useDebouncedAutoSave = (callback, delay = 1000) => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const timeoutRef = useRef(null);

  const debouncedSave = useCallback((data) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setIsSaving(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        await callback(data);
        setLastSaved(new Date());
      } catch (error) {
        console.error('Auto-save failed:', error);
      } finally {
        setIsSaving(false);
      }
    }, delay);
  }, [callback, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { debouncedSave, isSaving, lastSaved };
};


// ---------------------- Main App Component ----------------------
function KaryaApp() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingError, setLoadingError] = useState(null);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [tasks, setTasks] = useState([]);
  const [appState, setAppState] = useState(() => ({
    isAdminPanelOpen: false,
    currentUserId: localStorage.getItem('kartavya_userId') || null
  }));
  const { currentUserId, isAdminPanelOpen } = appState;
  const { t, setLanguage, language } = useI18n();
  const [dashboardDeptId, setDashboardDeptId] = useState('');
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('tasks'); // 'tasks', 'points', 'notifications'
  const [openTaskId, setOpenTaskId] = useState(null);
  const [isLocationsModalOpen, setIsLocationsModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('kartavya_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const [showNotification, setShowNotification] = useState(false);
  const [showPushBanner, setShowPushBanner] = useState(false);
  const [taskFeedback, setTaskFeedback] = useState(null);
  const [isEnablingPush, setIsEnablingPush] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Listen for online/offline changes
  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Notification scheduling settings
  const [notificationSettings, setNotificationSettings] = useState(() => {
    const saved = localStorage.getItem('kartavya_notification_settings');
    return saved ? JSON.parse(saved) : {
      enabled: true,
      reminderDays: [1, 3, 7], // Send reminders 1, 3, and 7 days before deadline
      reminderTime: '09:00', // Time of day to send reminders
      messageTemplate: 'Task "{taskTitle}" is due in {daysLeft} days. Please complete it on time.'
    };
  });

  // Helper: merge arrays by id without duplicates
  const mergeById = (a, b) => {
    const map = new Map();
    [...a, ...b].forEach((item) => { if (item && item.id) map.set(item.id, item); });
    return Array.from(map.values());
  };

  // Bootstrap: fetch initial snapshot (auth + dual collections) for first paint
  useEffect(() => {
    let unsubs = [];
    let loadingTimeout;
    
    async function bootstrap() {
      // Add timeout to prevent infinite loading
      loadingTimeout = setTimeout(() => {
        console.warn('Bootstrap timeout - forcing loading to false');
        setIsLoading(false);
        setLoadingError('Loading timeout - please refresh the page');
      }, 15000); // 15 second timeout
      
      try {
        // Initialize PWA analytics with current user data
        const currentUserId = localStorage.getItem('kartavya_userId');
        const currentUserName = localStorage.getItem('kartavya_userName');
        initializePwaAnalytics(currentUserId, currentUserName);
        
        // Listen for service worker logs
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'sw_log') {
              logPwaEvent(`sw_${event.data.data.type}`, event.data.data.details);
            }
          });
        }
        
        // Ensure read access if rules require auth
        try {
          if (!auth.currentUser) {
            await signInAnonymously(auth);
          }
        } catch (e) {
          console.warn('Anonymous sign-in failed (continuing):', e?.message);
        }

        const [usersLower, usersUpper, deptLower, deptUpper, a] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'Users')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'departments')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'Departments')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'activityLog')).catch(() => ({ docs: [] })),
        ]);

        const usersA = usersLower.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const usersB = usersUpper.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const mergedUsers = mergeById(usersA, usersB);
        console.log('Bootstrap: Loaded users:', mergedUsers.length, mergedUsers.map(u => u.username || u.name || u.email));
        setUsers(mergedUsers);
        
        // Store users globally for PWA analytics
        if (typeof window !== 'undefined') {
          window.kartavyaUsers = mergedUsers;
        }

        const deptA = deptLower.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const deptB = deptUpper.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const mergedDept = mergeById(deptA, deptB);
        setDepartments(mergedDept);

        
        // Clear timeout since we loaded successfully
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }
        
        // Only set loading to false after users are loaded (critical for login)
        if (mergedUsers.length > 0) {
          console.log('Bootstrap: Users loaded successfully, setting loading to false');
          setIsLoading(false);
        } else {
          // If no users found, still set loading to false but show appropriate message
          console.log('Bootstrap: No users found, setting loading to false');
          setIsLoading(false);
        }

        // Deep link to task
        try {
          const params = new URLSearchParams(window.location.search);
          const tid = params.get('task');
          if (tid) setOpenTaskId(tid);
        } catch {}

        // Load tasks immediately (critical for functionality)
        const unsub5 = subscribeTasks(setTasks);

        // Start realtime listeners immediately for admin panel functionality
        const unsub1 = onSnapshot(collection(db, 'users'), (snap) => {
          const us = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setUsers((prev) => {
            const merged = mergeById(us, prev);
            // Update global users for PWA analytics
            if (typeof window !== 'undefined') {
              window.kartavyaUsers = merged;
            }
            return merged;
          });
        });
        const unsub2 = onSnapshot(collection(db, 'Users'), (snap) => {
          const us = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setUsers((prev) => {
            const merged = mergeById(prev, us);
            // Update global users for PWA analytics
            if (typeof window !== 'undefined') {
              window.kartavyaUsers = merged;
            }
            return merged;
          });
        });
        const unsub3 = onSnapshot(collection(db, 'departments'), (snap) => {
          const dep = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setDepartments((prev) => mergeById(dep, prev));
        });
        const unsub4 = onSnapshot(collection(db, 'Departments'), (snap) => {
          const dep = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setDepartments((prev) => mergeById(prev, dep));
        });
        unsubs = [unsub1, unsub2, unsub3, unsub4, unsub5];
      } catch (e) {
        console.error('Bootstrap error', e);
        if (loadingTimeout) {
          clearTimeout(loadingTimeout);
        }
        setIsLoading(false);
        setLoadingError(`Loading failed: ${e.message}`);
      }
    }
    bootstrap();
    return () => { unsubs.forEach((fn) => fn && fn()); };
  }, []);

  // --- Smart Refresh Functions ---
  const refreshTasks = useCallback(async () => {
    try {
      // Force refresh tasks by getting latest data
      console.log('Refreshing tasks...');
      
      // Get fresh tasks data
      const [lowerTasksSnap, upperTasksSnap] = await Promise.all([
        getDocs(collection(db, 'tasks')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'Tasks')).catch(() => ({ docs: [] }))
      ]);
      
      const lowerTasks = lowerTasksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const upperTasks = upperTasksSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      
      // Merge tasks, avoiding duplicates
      const mergedTasks = [...lowerTasks];
      upperTasks.forEach(task => {
        if (!mergedTasks.find(t => t.id === task.id)) {
          mergedTasks.push(task);
        }
      });
      
      setTasks(mergedTasks);
      console.log('Tasks refreshed:', mergedTasks.length);
      
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    }
  }, []);
  
  const refreshUsers = useCallback(async () => {
    try {
      const [usersLower, usersUpper] = await Promise.all([
        getDocs(collection(db, 'users')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'Users')).catch(() => ({ docs: [] }))
      ]);
      
      const usersA = usersLower.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const usersB = usersUpper.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const mergedUsers = mergeById(usersA, usersB);
      setUsers(mergedUsers);
    } catch (error) {
      console.error('Failed to refresh users:', error);
    }
  }, []);
  
  const refreshDepartments = useCallback(async () => {
    try {
      const [deptLower, deptUpper] = await Promise.all([
        getDocs(collection(db, 'departments')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'Departments')).catch(() => ({ docs: [] }))
      ]);
      
      const deptA = deptLower.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const deptB = deptUpper.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const mergedDept = mergeById(deptA, deptB);
      setDepartments(mergedDept);
    } catch (error) {
      console.error('Failed to refresh departments:', error);
    }
  }, []);
  
  
  // Initialize smart refresh hook
  const { 
    isRefreshing, 
    refreshProgress, 
    lastRefresh, 
    performSmartRefresh, 
    forceRefresh, 
    pullDistance 
  } = useSmartRefresh({
    tasks: refreshTasks,
    users: refreshUsers,
    departments: refreshDepartments
  });

  // --- Derived State & Helpers ---
  const currentUser = useMemo(() => users.find((u) => u.id === currentUserId), [users, currentUserId]);
  
  // Initialize location tracking
  const currentUserName = useMemo(() => {
    if (!currentUser) return null;
    return (
      currentUser.name ||
      currentUser.username ||
      currentUser.email ||
      (currentUser.id ? `User-${currentUser.id.substring(0, 8)}` : null)
    );
  }, [currentUser]);

  useLocationTracking(currentUser?.id, currentUserName);
 
  // Debug: Log task loading status
  useEffect(() => {
    console.log('Tasks state updated:', {
      tasksCount: tasks.length,
      isLoading,
      currentUserId,
      usersCount: users.length
    });
  }, [tasks, isLoading, currentUserId, users]);
 
  // Auto-enable push if permission already granted
  useEffect(() => {
    if (!currentUser) return;
    if (typeof Notification === 'undefined') return;
    const savedForUser = localStorage.getItem(`kartavya_push_saved_${currentUser.id}`);
    if (Notification.permission === 'granted' && !savedForUser) {
      (async () => {
        try {
          await handleEnablePush();
          localStorage.setItem(`kartavya_push_saved_${currentUser.id}`, '1');
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [currentUser]);

  // Show banner to enable push for browsers/PWA when permission is default
  useEffect(() => {
    if (!currentUser) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') {
      setShowPushBanner(false);
      return;
    }
    const dismissedKey = `kartavya_push_dismissed_${currentUser.id}`;
    const dismissedAt = parseInt(localStorage.getItem(dismissedKey) || '0', 10);
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    if (!dismissedAt || now - dismissedAt > sevenDaysMs) {
      setShowPushBanner(true);
    }
  }, [currentUser]);

  const latestUnreadNotification = useMemo(() => notifications.find(n => !n.read), [notifications]);

  // Check for new task notifications
  useEffect(() => {
    if (!currentUser || !tasks.length) {
      return;
    }
    
    const myNewTasks = tasks.filter(task => 
      task.assignedUserIds.includes(currentUser.id) && 
      task.status === STATUSES.PENDING &&
      !task.notifiedUsers?.includes(currentUser.id)
    );
    
    if (myNewTasks.length > 0) {
      const newNotification = {
        id: Date.now(),
        type: 'newTask',
        title: t('newTaskAssigned'),
        message: myNewTasks.length === 1 
          ? `${t('youHaveBeenAssigned')}: "${myNewTasks[0].title}"`
          : t('youHaveNewTasks').replace('{count}', myNewTasks.length),
        tasks: myNewTasks,
        taskId: myNewTasks[0].id, // Primary task ID for deep linking
        timestamp: toISTISOString(),
        read: false
      };
      
      setNotifications(prev => [newNotification, ...prev]);
      setShowNotification(true);

      // Also show a browser/system notification if permission granted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const browserNotification = new Notification(newNotification.title, {
            body: newNotification.message,
            icon: '/favicon.ico',
            data: { taskId: newNotification.taskId, type: 'newTask' } // Include task data for deep linking
          });
          
          // Handle click on browser notification
          browserNotification.onclick = () => {
            if (newNotification.taskId) {
              handleTaskClick(newNotification.taskId);
            }
            browserNotification.close();
          };
        } catch {}
      }
      
      // Play notification sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
        audio.volume = 0.3;
        audio.play().catch(() => {}); // Ignore errors if audio fails
      } catch (e) {
        // Ignore audio errors
      }
      
      // Mark tasks as notified
      myNewTasks.forEach(task => {
        const updatedTask = {
          ...task,
          notifiedUsers: [...(task.notifiedUsers || []), currentUser.id]
        };
        updateTaskData(updatedTask.id, updatedTask, currentUser.id);
      });
    }
  }, [tasks, currentUser]);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('kartavya_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Save notification settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('kartavya_notification_settings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  // Auto-hide notification after 10 seconds
  useEffect(() => {
    if (showNotification && notifications.length > 0) {
      const timer = setTimeout(() => {
        setShowNotification(false);
        // Mark the visible notification as read when it auto-hides
        const unread = notifications.find(n => !n.read);
        if (unread) {
          markNotificationAsRead(unread.id);
        }
      }, 10000); // 10 seconds
      
      return () => clearTimeout(timer);
    }
  }, [showNotification, notifications]);

  // Check for upcoming task deadlines and send reminders
  useEffect(() => {
    if (!notificationSettings.enabled || !tasks.length) return;

    const checkDeadlines = () => {
      const now = new Date();
      const currentTime = now.getHours() * 60 + now.getMinutes();
      const reminderTimeMinutes = parseInt(notificationSettings.reminderTime.split(':')[0]) * 60 + 
                                 parseInt(notificationSettings.reminderTime.split(':')[1]);

      // Only check once per day at the specified time
      if (Math.abs(currentTime - reminderTimeMinutes) > 30) return;

      tasks.forEach(task => {
        if (!task.targetDate || task.status === STATUSES.COMPLETE) return;

        const targetDate = new Date(task.targetDate);
        const daysUntilDeadline = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));

        // Check if we should send a reminder today
        if (notificationSettings.reminderDays.includes(daysUntilDeadline)) {
          // Check if we already sent this reminder
          const reminderKey = `reminder_${task.id}_${daysUntilDeadline}`;
          const lastReminder = localStorage.getItem(reminderKey);
          const today = now.toDateString();

          if (lastReminder !== today) {
            // Send reminder to all assigned users
            task.assignedUserIds.forEach(userId => {
              const user = users.find(u => u.id === userId);
              if (user) {
                const reminderMessage = notificationSettings.messageTemplate
                  .replace('{taskTitle}', task.title)
                  .replace('{daysLeft}', daysUntilDeadline);

                const reminderNotification = {
                  id: Date.now() + Math.random(),
                  type: 'deadlineReminder',
                  title: 'Task Deadline Reminder',
                  message: reminderMessage,
                  tasks: [task],
                  taskId: task.id, // Task ID for deep linking
                  timestamp: toISTISOString(),
                  read: false,
                  userId: userId
                };

                // Store reminder in localStorage for this user
                const userReminders = JSON.parse(localStorage.getItem(`kartavya_notifications_${userId}`) || '[]');
                userReminders.push(reminderNotification);
                localStorage.setItem(`kartavya_notifications_${userId}`, JSON.stringify(userReminders));

                // Mark reminder as sent
                localStorage.setItem(reminderKey, today);
              }
            });
          }
        }
      });
    };

    // Check deadlines every hour
    const interval = setInterval(checkDeadlines, 60 * 60 * 1000);
    checkDeadlines(); // Check immediately

    return () => clearInterval(interval);
  }, [tasks, users, notificationSettings]);

  // Helper: check if a user is in a department (only uses departmentIds)
  const isUserInDepartment = useMemo(() => (user, deptId) => {
    if (!user) return false;
    if (Array.isArray(user.departmentIds)) return user.departmentIds.includes(deptId);
    return false;
  }, []);

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === ROLES.ADMIN) {
        // Admins can see all departments by default
        setDashboardDeptId('all');
      } else {
        // Regular users and heads see their own department
        const firstDept = currentUser.departmentIds?.[0] || '';
        setDashboardDeptId(firstDept);
      }
    }
  }, [currentUser]);

  // --- UI Setters ---
  const toggleAdminPanel = () => setAppState((s) => ({ ...s, isAdminPanelOpen: !s.isAdminPanelOpen }));
  const toggleAttendanceModal = () => setIsAttendanceModalOpen(!isAttendanceModalOpen);
  
  const showTaskFeedback = (message, type = 'success') => {
    setTaskFeedback({ message, type, timestamp: Date.now() });
    setTimeout(() => setTaskFeedback(null), 3000); // Auto-hide after 3 seconds
  };



  const handleLogin = (userId) => {
    localStorage.setItem('kartavya_userId', userId);
    setAppState((s) => ({ ...s, currentUserId: userId }));
    // Log login activity
    const user = users.find(u => u.id === userId);
    if (user) {
      // Store current user data for PWA analytics
      localStorage.setItem('kartavya_userName', user.name || user.username || 'Unknown');
      localStorage.setItem('kartavya_currentUser', JSON.stringify(user));
      // Immediately refresh PWA analytics identity
      try {
        initializePwaAnalytics(user.id, user.name || user.username || 'Unknown');
      } catch {}
      
      logActivity('login', 'user', userId, user.name, userId, user.name, {
        userRole: user.role,
        userDepartments: user.departmentIds,
        loginTime: new Date().toISOString()
      });
    }
  };
  const handleLogout = () => {
    // Log logout activity
    if (currentUser) {
      logActivity('logout', 'user', currentUser.id, currentUser.name, currentUser.id, currentUser.name, {
        userRole: currentUser.role,
        userDepartments: currentUser.departmentIds,
        logoutTime: new Date().toISOString()
      });
    }
    localStorage.removeItem('kartavya_userId');
    localStorage.removeItem('kartavya_userName');
    localStorage.removeItem('kartavya_currentUser');
    // Also clear analytics identity
    try {
      initializePwaAnalytics('anonymous', 'Unknown');
    } catch {}
    setAppState((s) => ({ ...s, currentUserId: null }));
  };

  // --- Firestore Mutations ---

  // Notification functions
  const markNotificationAsRead = (notificationId) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
  };

  const removeNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const updateNotificationSettings = (newSettings) => {
    setNotificationSettings(newSettings);
  };

  // Handle task click from notifications
  const handleTaskClick = (taskId) => {
    setOpenTaskId(taskId);
    setActiveTab('tasks'); // Switch to tasks tab
    // Update URL to include task parameter
    const url = new URL(window.location);
    url.searchParams.set('task', taskId);
    window.history.pushState({}, '', url);
  };

  // Foreground FCM -> system notifications
  useEffect(() => {
    onForegroundMessage((payload) => {
      const n = payload?.notification;
      const data = payload?.data;
      if (!n || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        const browserNotification = new Notification(n.title || 'Notification', {
          body: n.body || '',
          icon: n.icon || '/favicon.ico',
          data: data // Include payload data for deep linking
        });
        
        // Handle click on FCM notification
        browserNotification.onclick = () => {
          if (data?.taskId) {
            handleTaskClick(data.taskId);
          }
          browserNotification.close();
        };
      } catch {}
    });
  }, []);

  // Enable push from bell
  const handleEnablePush = async () => {
    try {
      const VAPID_PUBLIC_KEY = 'BO9okw1sNYRUrxe2JWvOgzUIxyi90UTkHh7MimNXq0R9EGOvCKmBI2nDmT9xpFoLUCSiGXCPGhrId4Qsm-q0dwM';
      setIsEnablingPush(true);
      const token = await enablePushNotifications(VAPID_PUBLIC_KEY);

      if (currentUser?.id && token) {
        await updateDoc(doc(db, 'users', currentUser.id), { fcmTokens: arrayUnion(token) });
        localStorage.setItem(`kartavya_push_saved_${currentUser.id}`, '1');
        setShowPushBanner(false);
        setNotifications(prev => [{
          id: Date.now(),
          type: 'info',
          title: t('notifications'),
          message: 'Push notifications enabled on this device',
          timestamp: toISTISOString(),
          read: false
        }, ...prev]);
      }
    } catch (e) {
      console.error('Enable push failed:', e);
      setNotifications(prev => [{
        id: Date.now(),
        type: 'error',
        title: t('notifications'),
        message: 'Failed to enable push notifications',
        timestamp: toISTISOString(),
        read: false
      }, ...prev]);
    }
    finally {
      setIsEnablingPush(false);
    }
  };

  // Guard: only decide login after initial data is loaded
  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface text-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-2 text-sm text-slate-500">{t('loading')}</p>
          {loadingError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{loadingError}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
              >
                Refresh Page
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!users.length) {
    // Explicit empty state to make issues visible
    return (
      <div className="min-h-screen bg-surface text-slate-900 flex items-center justify-center p-6 text-center">
        <div>
          <h2 className="text-lg font-semibold mb-2">No users found</h2>
          <p className="text-slate-600 text-sm">Please ensure Firestore has a collection named <code>users</code> or <code>Users</code> with user documents. If you recently changed security rules, reload the app.</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-surface text-slate-900">
        <Header t={t} />
        <main className="mx-auto max-w-md p-4">
          <LoginScreen users={users} onLogin={handleLogin} isLoading={isLoading} t={t} />
        </main>
      </div>
    );
  }

  const isAdmin = currentUser.role === ROLES.ADMIN;
  const isDeptHead = currentUser.role === ROLES.HEAD;
  const viewingDeptId = (isAdmin || isDeptHead) ? dashboardDeptId : currentUser.departmentIds?.[0];
  const viewingDept = departments.find((d) => d.id === viewingDeptId);
  const myTasks = tasks.filter((t) => t.assignedUserIds.includes(currentUser.id));
  const deptTasks = viewingDeptId === 'all' 
    ? tasks 
    : tasks.filter((t) => t.departmentId === viewingDeptId);
  const deptUsers = viewingDeptId === 'all' 
    ? users 
    : users.filter((u) => isUserInDepartment(u, viewingDeptId));

  return (
    <LocationPermission onLocationDenied={() => {
      // Log out user or show blank screen when location is denied
      console.log('Location denied, restricting app access');
    }}>
      <div className="min-h-screen bg-surface text-slate-900">
      {!isOnline && (
        <div className="bg-amber-500 text-white text-xs px-3 py-2 text-center">
          You are offline. Changes may not sync until connection is restored.
        </div>
      )}
      {showPushBanner && (
        <div className="bg-blue-600 text-white text-sm px-3 py-2 flex items-center justify-between">
          <span>Enable push notifications to get alerts even when the app is closed.</span>
          <div className="flex items-center gap-2">
            <button disabled={isEnablingPush} onClick={handleEnablePush} className="bg-white text-blue-700 px-2 py-1 rounded disabled:opacity-60">{isEnablingPush ? 'Enabling…' : 'Enable'}</button>
            <button onClick={() => { setShowPushBanner(false); if (currentUser) localStorage.setItem(`kartavya_push_dismissed_${currentUser.id}`, String(Date.now())); }} className="opacity-80 hover:opacity-100">✕</button>
          </div>
        </div>
      )}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onToggleAdminPanel={toggleAdminPanel}
        onToggleAttendance={toggleAttendanceModal}
        language={language}
        setLanguage={setLanguage}
        t={t}
        tasks={tasks}
        users={users}
        departments={departments}
        notifications={notifications}
        onToggleNotifications={() => setShowNotification(!showNotification)}
        onMarkNotificationAsRead={markNotificationAsRead}
        onRemoveNotification={removeNotification}
        onClearAllNotifications={clearAllNotifications}
        onEnablePush={handleEnablePush}
      />
      {/* Smart Refresh Indicator */}
      <RefreshIndicator
        isRefreshing={isRefreshing}
        refreshProgress={refreshProgress}
        pullDistance={pullDistance}
      />
      <main className={`mx-auto p-3 ${activeTab === 'management' ? 'max-w-none px-4 lg:px-8' : 'max-w-md'}`}>
        {/* Tab Content */}
        {activeTab === 'tasks' && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">Loading tasks...</span>
            </div>
          }>
            <TasksTab
              currentUser={currentUser}
              users={users}
              departments={departments}
              tasks={tasks}
              t={t}
              openTaskId={openTaskId}
              setOpenTaskId={setOpenTaskId}
              onTaskFeedback={showTaskFeedback}
            />
          </Suspense>
        )}
        
        {activeTab === 'points' && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">Loading points...</span>
            </div>
          }>
            <PointsTab
              currentUser={currentUser}
              tasks={tasks}
              users={users}
              departments={departments}
              t={t}
              onGoToTasks={() => setActiveTab('tasks')}
            />
          </Suspense>
        )}

        {activeTab === 'market' && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">Loading market...</span>
            </div>
          }>
            <MarketTab 
              currentUser={currentUser}
              t={t}
            />
          </Suspense>
        )}

        {activeTab === 'department' && (currentUser?.role === ROLES.ADMIN || currentUser?.role === ROLES.HEAD || currentUser?.role === ROLES.MANAGEMENT) && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">Loading department dashboard...</span>
            </div>
          }>
            <DepartmentDashboardTab
              currentUser={currentUser}
              users={users}
              departments={departments}
              tasks={tasks}
              t={t}
              onUpdateTask={(patch) => {
                if (!patch || typeof patch !== 'object') return Promise.reject(new Error('Invalid patch'));
                const { id, ...rest } = patch;
                if (!id) return Promise.reject(new Error('Missing task id'));
                return updateTaskData(id, rest, currentUser?.id || null, currentUser?.name || currentUser?.username || 'Unknown');
              }}
              onDeleteTask={deleteTaskData}
              onDeleteComment={(taskId, commentId) => {
                // Handle comment deletion logic here
                console.log('Delete comment:', taskId, commentId);
              }}
            />
          </Suspense>
        )}

        {activeTab === 'management' && (canAccessFeature(currentUser?.role, 'management-dashboard') || canAccessFeature(currentUser?.role, 'analytics-dashboard')) && (
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="ml-2 text-sm text-slate-500">Loading management...</span>
            </div>
          }>
            <ManagementSection
              currentUser={currentUser}
              users={users}
              departments={departments}
              tasks={tasks}
              activityLogs={[]}
              t={t}
              onTaskFeedback={showTaskFeedback}
              AnalyticsDashboard={AnalyticsDashboard}
            />
          </Suspense>
        )}
        

        
        {/* Bottom spacing for tabs */}
        <div className="h-20"></div>
      </main>
      
      {/* Bottom Tabs */}
      <Suspense fallback={
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 text-center">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      }>
        <BottomTabs activeTab={activeTab} setActiveTab={setActiveTab} t={t} currentUser={currentUser} />
      </Suspense>
      
      {/* Task Feedback Notification */}
      {taskFeedback && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 ${
          taskFeedback.type === 'success' 
            ? 'bg-green-500 text-white' 
            : taskFeedback.type === 'error' 
            ? 'bg-red-500 text-white' 
            : 'bg-blue-500 text-white'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {taskFeedback.type === 'success' ? '✅' : taskFeedback.type === 'error' ? '❌' : 'ℹ️'}
            </span>
            <span className="font-medium">{taskFeedback.message}</span>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdmin && isAdminPanelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">{t('adminPanel')}</h3>
              <button
                onClick={toggleAdminPanel}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-2 text-sm text-slate-500">Loading admin panel...</span>
                </div>
              }>
                <AdminPanel
                  key={`admin-${users.length}-${departments.length}`}
                  users={users}
                  departments={departments}
                  notificationSettings={notificationSettings}
                  onUpdateNotificationSettings={updateNotificationSettings}
                  currentUser={currentUser}
                  t={t}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Notification Overlay */}
      {showNotification && latestUnreadNotification && (
        <NotificationOverlay
          notification={latestUnreadNotification}
          onClose={() => setShowNotification(false)}
          onMarkAsRead={markNotificationAsRead}
          onTaskClick={handleTaskClick}
          t={t}
        />
      )}

      {/* Locations Modal */}
      {isLocationsModalOpen && currentUser?.role === ROLES.ADMIN && (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Loading locations...</p>
            </div>
          </div>
        }>
          <LocationsModal
            isOpen={isLocationsModalOpen}
            onClose={() => setIsLocationsModalOpen(false)}
            currentUser={currentUser}
            users={users}
            t={t}
          />
        </Suspense>
      )}

      {/* Attendance Modal */}
      <Suspense fallback={
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading attendance...</p>
          </div>
        </div>
      }>
        <AttendanceModal
          isOpen={isAttendanceModalOpen}
          onClose={() => setIsAttendanceModalOpen(false)}
          t={t}
        />
      </Suspense>
    </div>
    </LocationPermission>
  );
}

// ---------------------- Child Components ----------------------

export default KaryaApp;
