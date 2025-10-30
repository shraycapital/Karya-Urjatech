const { collection, getDocs, query, where, orderBy } = require('firebase-admin/firestore');

class PWAAnalyticsProcessor {
  constructor(db) {
    this.db = db;
  }

  getDateKey(date = new Date()) {
    return date.toISOString().split('T')[0];
  }

  async getAnalyticsData(startDate, endDate, userIds = null) {
    try {
      const startDateKey = this.getDateKey(new Date(startDate));
      const endDateKey = this.getDateKey(new Date(endDate));
      
      const q = query(
        collection(this.db, 'pwaDailySummaries'),
        where('date', '>=', startDateKey),
        where('date', '<=', endDateKey),
        orderBy('date', 'asc')
      );

      const snapshot = await getDocs(q);
      const dailyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const result = this.processAnalyticsData(dailyData, userIds);
      return result;
    } catch (error) {
      console.error('[PWA Analytics Function] Failed to get analytics data:', error);
      throw new functions.https.HttpsError('internal', 'Failed to retrieve analytics data.', error.message);
    }
  }

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

    dailyData.forEach(day => {
      analytics.totalEvents += day.totalEvents || 0;
      analytics.totalSessions += day.sessions ? Object.keys(day.sessions).length : 0;
      
      Object.entries(day.categories || {}).forEach(([category, count]) => {
        analytics.categoryTotals[category] = (analytics.categoryTotals[category] || 0) + count;
      });

      Object.entries(day.eventTypes || {}).forEach(([eventType, count]) => {
        analytics.eventTypeTotals[eventType] = (analytics.eventTypeTotals[eventType] || 0) + count;
      });

      Object.entries(day.userActivity || {}).forEach(([userId, activity]) => {
        if (userIds && !userIds.includes(userId)) {
          return;
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
        
        Object.entries(activity.categories || {}).forEach(([category, count]) => {
          analytics.userTotals[userId].categories[category] = (analytics.userTotals[userId].categories[category] || 0) + count;
        });

        Object.entries(activity.eventTypes || {}).forEach(([eventType, count]) => {
          analytics.userTotals[userId].eventTypes[eventType] = (analytics.userTotals[userId].eventTypes[eventType] || 0) + count;
        });
      });

      Object.entries(day.displayModes || {}).forEach(([mode, count]) => {
        analytics.displayModeTotals[mode] = (analytics.displayModeTotals[mode] || 0) + count;
      });

      Object.entries(day.languages || {}).forEach(([lang, count]) => {
        analytics.languageTotals[lang] = (analytics.languageTotals[lang] || 0) + count;
      });

      Object.entries(day.timezones || {}).forEach(([tz, count]) => {
        analytics.timezoneTotals[tz] = (analytics.timezoneTotals[tz] || 0) + count;
      });
    });

    analytics.totalUsers = analytics.totalUsers.size;

    analytics.trends.eventsOverTime = analytics.dailyBreakdown.map(day => ({
      date: day.date,
      events: day.totalEvents,
      users: day.uniqueUsers
    }));

    return analytics;
  }
}

module.exports = { PWAAnalyticsProcessor };
