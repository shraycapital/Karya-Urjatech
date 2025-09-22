import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';

// Enhanced PWA telemetry logging with user context
export async function logPwaEvent(eventType, details = {}, userId = null) {
  try {
    const displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
    const isStandalone = navigator.standalone || false; // iOS legacy
    const ua = navigator.userAgent;
    const language = navigator.language;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Network info (Chromium only)
    const connection = navigator.connection ? {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt
    } : null;

    // URL params for shortcut launches
    const urlParams = new URLSearchParams(window.location.search);
    const shortcutId = urlParams.get('shortcut') || null;

    // Get current user ID if not provided
    const currentUserId = userId || getCurrentUserId();
    
    // Debug logging (remove in production)
    if (currentUserId === 'anonymous') {
      console.log('[PWA Telemetry] User ID detection:', {
        localStorage: localStorage.getItem('kartavya_userId'),
        firebaseAuth: window.firebase?.auth?.currentUser?.uid,
        result: currentUserId
      });
    }

    // Categorize event type for better organization
    const category = categorizeEvent(eventType);

    await addDoc(collection(db, 'pwaTelemetry'), {
      type: eventType,
      category,
      details,
      userId: currentUserId,
      displayMode,
      isStandalone,
      ua,
      language,
      timezone,
      connection,
      shortcutId,
      url: window.location.href,
      sessionId: getSessionId(),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('[PWA] Failed to persist telemetry event', eventType, error?.message);
  }
}

// Get current user ID from auth or localStorage
function getCurrentUserId() {
  try {
    // Try to get from localStorage first (app's custom user system)
    const userId = localStorage.getItem('kartavya_userId');
    if (userId) {
      return userId;
    }
    
    // Fallback to Firebase auth
    if (typeof window !== 'undefined' && window.firebase?.auth?.currentUser?.uid) {
      return window.firebase.auth.currentUser.uid;
    }
    
    return 'anonymous';
  } catch {
    return 'anonymous';
  }
}

// Generate or get session ID
function getSessionId() {
  try {
    let sessionId = sessionStorage.getItem('pwa_session_id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('pwa_session_id', sessionId);
    }
    return sessionId;
  } catch {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Categorize events for better organization
function categorizeEvent(eventType) {
  if (eventType.startsWith('beforeinstallprompt') || eventType.startsWith('appinstalled') || eventType.startsWith('prompt_')) {
    return 'install_funnel';
  }
  if (eventType.startsWith('web_vital_') || eventType.startsWith('performance_')) {
    return 'performance';
  }
  if (eventType.startsWith('js_error') || eventType.startsWith('unhandled_rejection') || eventType.startsWith('network_error')) {
    return 'errors';
  }
  if (eventType.startsWith('sw_')) {
    return 'service_worker';
  }
  if (eventType.startsWith('push_')) {
    return 'notifications';
  }
  if (eventType.startsWith('bg_sync_')) {
    return 'background_sync';
  }
  if (eventType.includes('visibility') || eventType.includes('connection') || eventType.includes('display_mode')) {
    return 'app_lifecycle';
  }
  if (eventType === 'app_launch') {
    return 'app_lifecycle';
  }
  return 'general';
}

// Performance monitoring
export function logWebVitals() {
  try {
    // Largest Contentful Paint
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      logPwaEvent('web_vital_lcp', { value: lastEntry.startTime });
    }).observe({ entryTypes: ['largest-contentful-paint'] });

    // Cumulative Layout Shift
    new PerformanceObserver((list) => {
      let clsValue = 0;
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      if (clsValue > 0) {
        logPwaEvent('web_vital_cls', { value: clsValue });
      }
    }).observe({ entryTypes: ['layout-shift'] });

    // Interaction to Next Paint (INP)
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        logPwaEvent('web_vital_inp', { 
          value: entry.processingStart - entry.startTime,
          interactionType: entry.name
        });
      }
    }).observe({ entryTypes: ['event'] });
  } catch (error) {
    console.warn('[PWA] Failed to setup Web Vitals monitoring:', error?.message);
  }
}

// Error monitoring
export function setupErrorMonitoring() {
  // JavaScript errors
  window.addEventListener('error', (event) => {
    logPwaEvent('js_error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    });
  });

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    logPwaEvent('unhandled_rejection', {
      reason: event.reason?.toString(),
      stack: event.reason?.stack
    });
  });

  // Network failures
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    try {
      const response = await originalFetch(...args);
      if (!response.ok) {
        logPwaEvent('network_error', {
          url: args[0],
          status: response.status,
          statusText: response.statusText
        });
      }
      return response;
    } catch (error) {
      logPwaEvent('network_error', {
        url: args[0],
        error: error.message
      });
      throw error;
    }
  };
}

// Service Worker lifecycle monitoring
export function logServiceWorkerEvent(eventType, details = {}) {
  logPwaEvent(`sw_${eventType}`, details);
}

// Push notification events
export async function logPushEvent(eventType, details = {}) {
  try {
    const permission = Notification.permission;
    const subscription = await navigator.serviceWorker?.ready?.then(sw => 
      sw.pushManager?.getSubscription()
    );
    
    await logPwaEvent(`push_${eventType}`, {
      ...details,
      permission,
      hasSubscription: !!subscription,
      endpoint: subscription?.endpoint
    });
  } catch (error) {
    console.warn('[PWA] Failed to log push event:', error?.message);
  }
}

// Background sync events
export function logBackgroundSyncEvent(eventType, details = {}) {
  logPwaEvent(`bg_sync_${eventType}`, details);
}

// Storage persistence
export async function requestStoragePersistence() {
  try {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      const persisted = await navigator.storage.persist();
      logPwaEvent('storage_persistence', { persisted });
      return persisted;
    }
  } catch (error) {
    console.warn('[PWA] Failed to request storage persistence:', error?.message);
  }
  return false;
}

// Initialize all telemetry
export function initializePwaTelemetry() {
  // Log app launch
  logPwaEvent('app_launch', {
    referrer: document.referrer,
    timestamp: Date.now()
  });

  // Setup monitoring
  logWebVitals();
  setupErrorMonitoring();
  
  // Request storage persistence
  requestStoragePersistence();

  // Log display mode changes
  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  mediaQuery.addEventListener('change', (e) => {
    logPwaEvent('display_mode_change', { 
      standalone: e.matches,
      timestamp: Date.now()
    });
  });

  // Log visibility changes (app backgrounding/foregrounding)
  document.addEventListener('visibilitychange', () => {
    logPwaEvent('visibility_change', {
      hidden: document.hidden,
      timestamp: Date.now()
    });
  });

  // Log online/offline status
  window.addEventListener('online', () => {
    logPwaEvent('connection_change', { online: true, timestamp: Date.now() });
  });
  
  window.addEventListener('offline', () => {
    logPwaEvent('connection_change', { online: false, timestamp: Date.now() });
  });
}
