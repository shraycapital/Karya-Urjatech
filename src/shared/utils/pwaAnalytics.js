import { collection, addDoc, getDocs, getDoc, query, where, orderBy, limit, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { logPWAActivity } from './activityLogger';
import React, { useState, useEffect, useMemo } from 'react';
import { getAnalytics, logEvent } from "firebase/analytics";
import { cleanFirestoreData } from './firestoreHelpers';

// Daily aggregation system for PWA analytics
export class PWAAnalyticsManager {
  constructor() {
    this.dailySummaries = new Map();
    this.isProcessing = false;
  }

  // Get today's date key for aggregation
  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  }

  // Log event and update daily aggregation
  async logEvent(eventType, details = {}, userId = null) {
    try {
      console.log('[PWA Analytics] Logging event:', { eventType, details, userId });
      // Always resolve the userId from local storage if not provided
      const resolvedUserId = userId || this.getCurrentUserId();
      
      // Log individual event (for detailed tracking)
      await this.logIndividualEvent(eventType, details, resolvedUserId);
      
      // Update daily aggregation
      await this.updateDailyAggregation(eventType, details, resolvedUserId);
      
      // Log PWA activity to activity log
      try {
        const userName = this.getUserName(resolvedUserId);
        await logPWAActivity(eventType, details, resolvedUserId, userName, false);
      } catch (error) {
        console.warn('[PWA Analytics] Failed to log PWA activity:', error?.message);
      }
      
      console.log('[PWA Analytics] Event logged successfully');
    } catch (error) {
      console.warn('[PWA Analytics] Failed to log event:', error?.message);
    }
  }

  // Log individual event to pwaTelemetry collection
  async logIndividualEvent(eventType, details = {}, userId = null) {
    const displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
    const isStandalone = navigator.standalone || false;
    const ua = navigator.userAgent;
    const language = navigator.language;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const connection = navigator.connection ? {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt
    } : null;

    const urlParams = new URLSearchParams(window.location.search);
    const shortcutId = urlParams.get('shortcut') || null;
    const currentUserId = userId || this.getCurrentUserId();
    const category = this.categorizeEvent(eventType);

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
      sessionId: this.getSessionId(),
      createdAt: serverTimestamp(),
    });
  }

  // Update daily aggregation
  async updateDailyAggregation(eventType, details = {}, userId = null) {
    const dateKey = this.getDateKey();
    const currentUserId = userId || this.getCurrentUserId();
    const category = this.categorizeEvent(eventType);
    
    try {
      // Check if daily summary exists
      const dailySummaryRef = doc(db, 'pwaDailySummaries', dateKey);
      
      // Get existing summary or create new one
      const existingSummary = await this.getDailySummary(dateKey);
      
      if (existingSummary) {
        // Update existing summary
        await this.updateExistingSummary(dailySummaryRef, eventType, category, currentUserId, details);
      } else {
        // Create new daily summary
        await this.createNewSummary(dailySummaryRef, eventType, category, currentUserId, details);
      }
    } catch (error) {
      console.warn('[PWA Analytics] Failed to update daily aggregation:', error?.message);
    }
  }

  // Get daily summary for a specific date
  async getDailySummary(dateKey) {
    try {
      const docRef = doc(db, 'pwaDailySummaries', dateKey);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      console.warn('[PWA Analytics] Failed to get daily summary:', error?.message);
      return null;
    }
  }

  // Create new daily summary
  async createNewSummary(docRef, eventType, category, userId, details) {
    // IMPORTANT: Firestore cannot store Set or other non-plain JSON values.
    // Use plain objects for counters and maps so writes succeed reliably.
    const summary = {
      date: this.getDateKey(),
      totalEvents: 1,
      categories: { [category]: 1 },
      eventTypes: { [eventType]: 1 },
      userActivity: {
        [userId]: {
          totalEvents: 1,
          categories: { [category]: 1 },
          eventTypes: { [eventType]: 1 },
          lastActivity: serverTimestamp()
        }
      },
      displayModes: {},
      languages: {},
      timezones: {},
      // Track unique sessions for the day using an object map
      sessions: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Add additional context
    this.addContextToSummary(summary, details, userId);
    
    await setDoc(docRef, summary);
  }

  // Update existing daily summary
  async updateExistingSummary(docRef, eventType, category, userId, details) {
    const existingSummary = await this.getDailySummary(this.getDateKey());
    if (!existingSummary) return;

    const updates = {
      totalEvents: (existingSummary.totalEvents || 0) + 1,
      updatedAt: serverTimestamp()
    };

    // Update categories
    if (!updates.categories) updates.categories = { ...existingSummary.categories };
    updates.categories[category] = (updates.categories[category] || 0) + 1;

    // Update event types
    if (!updates.eventTypes) updates.eventTypes = { ...existingSummary.eventTypes };
    updates.eventTypes[eventType] = (updates.eventTypes[eventType] || 0) + 1;

    // Update user activity
    if (!updates.userActivity) updates.userActivity = { ...existingSummary.userActivity };
    if (!updates.userActivity[userId]) {
      updates.userActivity[userId] = {
        totalEvents: 0,
        categories: {},
        eventTypes: {},
        lastActivity: serverTimestamp()
      };
    }
    updates.userActivity[userId].totalEvents += 1;
    updates.userActivity[userId].categories[category] = (updates.userActivity[userId].categories[category] || 0) + 1;
    updates.userActivity[userId].eventTypes[eventType] = (updates.userActivity[userId].eventTypes[eventType] || 0) + 1;
    updates.userActivity[userId].lastActivity = serverTimestamp();

    // Carry forward existing context tallies first, then increment
    updates.displayModes = { ...(existingSummary.displayModes || {}) };
    updates.languages = { ...(existingSummary.languages || {}) };
    updates.timezones = { ...(existingSummary.timezones || {}) };
    updates.sessions = { ...(existingSummary.sessions || {}) };

    // Add context increments for this event
    this.addContextToSummary(updates, details, userId);

    // Clean undefined values from updates
    const cleanUpdates = cleanFirestoreData(updates);

    await updateDoc(docRef, cleanUpdates);
  }

  // Add context information to summary
  addContextToSummary(summary, details, userId) {
    // Display mode
    const displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
    if (!summary.displayModes) summary.displayModes = {};
    summary.displayModes[displayMode] = (summary.displayModes[displayMode] || 0) + 1;

    // Language
    const language = navigator.language;
    if (!summary.languages) summary.languages = {};
    summary.languages[language] = (summary.languages[language] || 0) + 1;

    // Timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!summary.timezones) summary.timezones = {};
    summary.timezones[timezone] = (summary.timezones[timezone] || 0) + 1;

    // Session (store as object map to be Firestore-friendly)
    const sessionId = this.getSessionId();
    if (!summary.sessions) summary.sessions = {};
    summary.sessions[sessionId] = true;
  }

  // Get analytics data for date range
  async getAnalyticsData(startDate, endDate, userIds = null) {
    try {
      const startDateKey = this.getDateKey(startDate);
      const endDateKey = this.getDateKey(endDate);
      
      console.log('[PWA Analytics] Querying data for date range:', { startDateKey, endDateKey, userId: userIds });
      
      const q = query(
        collection(db, 'pwaDailySummaries'),
        where('date', '>=', startDateKey),
        where('date', '<=', endDateKey),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const dailyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      console.log('[PWA Analytics] Found daily summaries:', dailyData.length, 'documents');
      console.log('[PWA Analytics] Daily data:', dailyData);

      // Process and aggregate data
      const result = this.processAnalyticsData(dailyData, userIds);
      console.log('[PWA Analytics] Processed analytics result:', result);
      return result;
    } catch (error) {
      console.warn('[PWA Analytics] Failed to get analytics data:', error?.message);
      return this.getEmptyAnalyticsData();
    }
  }

  // Process raw daily data into analytics insights
  processAnalyticsData(dailyData, userIds = null) {
    const analytics = {
      totalEvents: 0,
      totalUsers: new Set(),
      totalSessions: 0,
      dateRange: {
        start: dailyData[0]?.date || null,
        end: dailyData[dailyData.length - 1]?.date || null,
        days: dailyData.length
      },
      dailyBreakdown: dailyData.map(day => ({
        date: day.date,
        totalEvents: day.totalEvents || 0,
        uniqueUsers: Object.keys(day.userActivity || {}).length,
        categories: day.categories || {},
        eventTypes: day.eventTypes || {},
        displayModes: day.displayModes || {},
        languages: day.languages || {},
        timezones: day.timezones || {},
        sessionsCount: day.sessions ? Object.keys(day.sessions).length : 0
      })),
      categoryTotals: {},
      eventTypeTotals: {},
      userTotals: {},
      displayModeTotals: {},
      languageTotals: {},
      timezoneTotals: {},
      trends: {
        eventsOverTime: [],
        usersOverTime: [],
        categoryTrends: {},
        eventTypeTrends: {}
      }
    };

    // Aggregate data across all days
    dailyData.forEach(day => {
      analytics.totalEvents += day.totalEvents || 0;
      // Aggregate sessions
      analytics.totalSessions += day.sessions ? Object.keys(day.sessions).length : 0;
      
      // Aggregate categories
      Object.entries(day.categories || {}).forEach(([category, count]) => {
        analytics.categoryTotals[category] = (analytics.categoryTotals[category] || 0) + count;
      });

      // Aggregate event types
      Object.entries(day.eventTypes || {}).forEach(([eventType, count]) => {
        analytics.eventTypeTotals[eventType] = (analytics.eventTypeTotals[eventType] || 0) + count;
      });

      // Aggregate users
      Object.entries(day.userActivity || {}).forEach(([userId, activity]) => {
        if (userIds && !userIds.includes(userId)) {
          return; // Skip if user is not in the filter list
        }
        analytics.totalUsers.add(userId);
        if (!analytics.userTotals[userId]) {
          analytics.userTotals[userId] = {
            totalEvents: 0,
            categories: {},
            eventTypes: {},
            daysActive: 0
          };
        }
        analytics.userTotals[userId].totalEvents += activity.totalEvents || 0;
        analytics.userTotals[userId].daysActive += 1;
        
        // Aggregate user categories
        Object.entries(activity.categories || {}).forEach(([category, count]) => {
          analytics.userTotals[userId].categories[category] = (analytics.userTotals[userId].categories[category] || 0) + count;
        });

        // Aggregate user event types
        Object.entries(activity.eventTypes || {}).forEach(([eventType, count]) => {
          analytics.userTotals[userId].eventTypes[eventType] = (analytics.userTotals[userId].eventTypes[eventType] || 0) + count;
        });
      });

      // Aggregate display modes
      Object.entries(day.displayModes || {}).forEach(([mode, count]) => {
        analytics.displayModeTotals[mode] = (analytics.displayModeTotals[mode] || 0) + count;
      });

      // Aggregate languages
      Object.entries(day.languages || {}).forEach(([lang, count]) => {
        analytics.languageTotals[lang] = (analytics.languageTotals[lang] || 0) + count;
      });

      // Aggregate timezones
      Object.entries(day.timezones || {}).forEach(([tz, count]) => {
        analytics.timezoneTotals[tz] = (analytics.timezoneTotals[tz] || 0) + count;
      });
    });

    // Convert sets to counts
    analytics.totalUsers = analytics.totalUsers.size;

    // Calculate trends
    analytics.trends.eventsOverTime = analytics.dailyBreakdown.map(day => ({
      date: day.date,
      events: day.totalEvents,
      users: day.uniqueUsers
    }));

    // Filter by user if specified
    if (userIds) {
      analytics.userTotals = {};
      userIds.forEach(userId => {
        analytics.userTotals[userId] = analytics.userTotals[userId] || {};
        analytics.dailyBreakdown = analytics.dailyBreakdown.map(day => ({
          ...day,
          userEvents: day.userActivity?.[userId]?.totalEvents || 0
        }));
      });
    }

    return analytics;
  }

  // Get empty analytics data structure
  getEmptyAnalyticsData() {
    return {
      totalEvents: 0,
      totalUsers: 0,
      totalSessions: 0,
      dateRange: { start: null, end: null, days: 0 },
      dailyBreakdown: [],
      categoryTotals: {},
      eventTypeTotals: {},
      userTotals: {},
      displayModeTotals: {},
      languageTotals: {},
      timezoneTotals: {},
      trends: {
        eventsOverTime: [],
        usersOverTime: [],
        categoryTrends: {},
        eventTypeTrends: {}
      }
    };
  }

  // Helper methods
  getCurrentUserId() {
    try {
      const userId = localStorage.getItem('kartavya_userId');
      if (userId) return userId;
      
      if (typeof window !== 'undefined' && window.firebase?.auth?.currentUser?.uid) {
        return window.firebase.auth.currentUser.uid;
      }
      
      return 'anonymous';
    } catch {
      return 'anonymous';
    }
  }

  getUserName(userId) {
    try {
      // Prefer the full current user object from localStorage
      const currentUserData = localStorage.getItem('kartavya_currentUser');
      if (currentUserData) {
        const user = JSON.parse(currentUserData);
        if (user?.name) return user.name;
        if (user?.username) return user.username;
        if (user?.email) return user.email;
      }

      // Next, try the simple cached name
      const storedUser = localStorage.getItem('kartavya_userName');
      if (storedUser) return storedUser;

      // If we have a userId, try the globally cached users list
      if (userId && typeof window !== 'undefined' && window.kartavyaUsers) {
        const user = window.kartavyaUsers.find(u => u.id === userId);
        if (user) {
          return user.name || user.username || user.email || `User-${userId.substring(0, 8)}`;
        }
      }

      // Final fallbacks
      if (userId && userId !== 'anonymous') {
        return `User-${userId.substring(0, 8)}`;
      }
      return 'Unknown';
    } catch (error) {
      console.warn('[PWA Analytics] Error getting user name:', error);
      return 'Unknown';
    }
  }

  getSessionId() {
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

  categorizeEvent(eventType) {
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
}

// Export singleton instance
export const pwaAnalytics = new PWAAnalyticsManager();

// Enhanced logging functions that use the new system
export async function logPwaEvent(eventType, details = {}, userId = null) {
  return await pwaAnalytics.logEvent(eventType, details, userId);
}

// Initialize the new analytics system
export function initializePwaAnalytics(userId = null, userName = null) {
  // Store user data for future use
  if (userId && userId !== 'anonymous') {
    localStorage.setItem('kartavya_userId', userId);
  }
  if (userName) {
    localStorage.setItem('kartavya_userName', userName);
  }
  
  // Log app launch
  logPwaEvent('app_launch', {
    referrer: document.referrer,
    timestamp: Date.now()
  }, userId);

  // Setup monitoring (reuse existing functions)
  if (typeof window !== 'undefined') {
    // Web Vitals monitoring
    try {
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        logPwaEvent('web_vital_lcp', { value: lastEntry.startTime });
      }).observe({ entryTypes: ['largest-contentful-paint'] });

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
    } catch (error) {
      console.warn('[PWA Analytics] Failed to setup Web Vitals monitoring:', error?.message);
    }

    // Error monitoring
    window.addEventListener('error', (event) => {
      logPwaEvent('js_error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      logPwaEvent('unhandled_rejection', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      });
    });

    // App lifecycle monitoring
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    mediaQuery.addEventListener('change', (e) => {
      logPwaEvent('display_mode_change', { 
        standalone: e.matches,
        timestamp: Date.now()
      });
    });

    document.addEventListener('visibilitychange', () => {
      logPwaEvent('visibility_change', {
        hidden: document.hidden,
        timestamp: Date.now()
      });
    });

    window.addEventListener('online', () => {
      logPwaEvent('connection_change', { online: true, timestamp: Date.now() });
    });
    
    window.addEventListener('offline', () => {
      logPwaEvent('connection_change', { online: false, timestamp: Date.now() });
    });
  }
}
