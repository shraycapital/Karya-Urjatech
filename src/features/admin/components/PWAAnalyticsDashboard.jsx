import React, { useState, useEffect, useMemo } from 'react';
import { pwaAnalytics } from '../../../shared/utils/pwaAnalytics';
import { formatDateOnly, formatDateTime } from '../../../shared/utils/date';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function PWAAnalyticsDashboard({ users = [], departments = [], t }) {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('last30days');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Filter users based on selected department
  const filteredUsers = useMemo(() => {
    if (selectedDepartment === 'all') {
      return users;
    }
    return users.filter(user => user.departmentId === selectedDepartment);
  }, [users, selectedDepartment]);

  // When department changes, reset selected user if they are not in the new department
  useEffect(() => {
    if (selectedUser !== 'all' && !filteredUsers.find(u => u.id === selectedUser)) {
      setSelectedUser('all');
    }
  }, [selectedDepartment, selectedUser, filteredUsers]);
  
  // Get date range for analytics
  const getDateRange = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + (24 * 60 * 60 * 1000 - 1)); // End of today

    switch (dateRange) {
      case 'today':
        return { start: todayStart, end: todayEnd };
      case 'yesterday':
        const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayEnd = new Date(todayStart.getTime() - 1); // End of yesterday
        return { start: yesterdayStart, end: yesterdayEnd };
      case 'last7days':
        const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
        return { start: sevenDaysAgo, end: todayEnd };
      case 'last30days':
        const thirtyDaysAgo = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
        return { start: thirtyDaysAgo, end: todayEnd };
      case 'last90days':
        const ninetyDaysAgo = new Date(todayStart.getTime() - 89 * 24 * 60 * 60 * 1000);
        return { start: ninetyDaysAgo, end: todayEnd };
      case 'custom':
        return {
          start: customDateFrom ? new Date(customDateFrom) : null,
          end: customDateTo ? new Date(customDateTo + 'T23:59:59.999Z') : null
        };
      default:
        const defaultStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
        return { start: defaultStart, end: todayEnd };
    }
  };

  // Load analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const range = getDateRange();
        if (!range.start || !range.end) {
          setError('Please select a valid date range');
          setIsLoading(false);
          return;
        }

        const userIds = selectedDepartment === 'all' 
          ? (selectedUser === 'all' ? null : [selectedUser])
          : filteredUsers.map(u => u.id);

        const functions = getFunctions();
        const getPWAAnalytics = httpsCallable(functions, 'getPWAAnalytics');
        const result = await getPWAAnalytics({ 
          startDate: range.start.toISOString(), 
          endDate: range.end.toISOString(), 
          userIds 
        });

        setAnalyticsData(result.data);
      } catch (err) {
        setError('Failed to load analytics data');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadAnalytics();
  }, [dateRange, selectedUser, selectedDepartment, customDateFrom, customDateTo]);


  // Get user display name
  const getUserDisplayName = (userId) => {
    if (userId === 'anonymous') return 'Anonymous';
    const user = users.find(u => u.id === userId);
    return user ? (user.name || user.username || user.email || userId) : userId;
  };

  // Format numbers with commas
  const formatNumber = (num) => {
    return num ? num.toLocaleString() : '0';
  };

  // Get top categories
  const topCategories = useMemo(() => {
    if (!analyticsData?.categoryTotals) return [];
    return Object.entries(analyticsData.categoryTotals)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
  }, [analyticsData]);

  // Get top users
  const topUsers = useMemo(() => {
    if (!analyticsData?.userTotals) return [];
    return Object.entries(analyticsData.userTotals)
      .sort(([,a], [,b]) => b.totalEvents - a.totalEvents)
      .slice(0, 10);
  }, [analyticsData]);

  // Get daily trend data
  const trendData = useMemo(() => {
    if (!analyticsData?.dailyBreakdown) return [];
    return analyticsData.dailyBreakdown.map(day => ({
      date: day.date,
      events: day.totalEvents,
      users: day.uniqueUsers,
      displayName: formatDateOnly(day.date)
    }));
  }, [analyticsData]);

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-2 text-gray-600">Loading PWA Analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>❌ {error}</p>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="p-6 text-center text-gray-600">
        <p>No analytics data available for the selected period.</p>
      </div>
    );
  }

  // Handle display totals based on user selection
  const displayedTotalEvents = selectedUser === 'all'
    ? analyticsData.totalEvents
    : analyticsData.userTotals[selectedUser]?.totalEvents || 0;
  
  const displayedTotalUsers = selectedUser === 'all' 
    ? analyticsData.totalUsers 
    : (analyticsData.userTotals[selectedUser] ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h2 className="text-xl font-bold text-gray-900">PWA Analytics Dashboard</h2>
          <div className="flex items-center gap-2">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="text-sm border rounded px-3 py-1"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="last90days">Last 90 Days</option>
              <option value="custom">Custom Range</option>
            </select>
            
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border">
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="text-sm border rounded px-3 py-1 bg-white"
                  placeholder="From"
                  aria-label="From Date"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="text-sm border rounded px-3 py-1 bg-white"
                  placeholder="To"
                  aria-label="To Date"
                />
              </div>
            )}

            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="text-sm border rounded px-3 py-1"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>

            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="text-sm border rounded px-3 py-1"
            >
              <option value="all">All Users</option>
              {filteredUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {getUserDisplayName(user.id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Date range summary */}
        <div className="text-sm text-gray-600">
          <strong>Period:</strong> {analyticsData.dateRange.start} to {analyticsData.dateRange.end} 
          ({analyticsData.dateRange.days} days) | 
          <strong> Total Events:</strong> {formatNumber(displayedTotalEvents)} | 
          <strong> Unique Users:</strong> {formatNumber(displayedTotalUsers)}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'users', label: 'Users', icon: '👥' },
              { id: 'events', label: 'Events', icon: '📈' },
              { id: 'trends', label: 'Trends', icon: '📉' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{formatNumber(displayedTotalEvents)}</div>
                  <div className="text-sm text-blue-800">Total Events</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{formatNumber(displayedTotalUsers)}</div>
                  <div className="text-sm text-green-800">Unique Users</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{formatNumber(analyticsData.totalSessions)}</div>
                  <div className="text-sm text-purple-800">Sessions</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {analyticsData.dateRange.days > 0 ? Math.round(displayedTotalEvents / analyticsData.dateRange.days) : 0}
                  </div>
                  <div className="text-sm text-orange-800">Avg Events/Day</div>
                </div>
              </div>

              {/* Top Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Top Event Categories</h3>
                  <div className="space-y-2">
                    {topCategories.map(([category, count]) => (
                      <div key={category} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="capitalize">{category.replace('_', ' ')}</span>
                        <span className="font-semibold">{formatNumber(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Display Modes</h3>
                  <div className="space-y-2">
                    {Object.entries(analyticsData.displayModeTotals || {}).map(([mode, count]) => (
                      <div key={mode} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                        <span className="capitalize">{mode}</span>
                        <span className="font-semibold">{formatNumber(count)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === 'users' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">User Activity</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Events</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Active</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Top Category</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {topUsers.map(([userId, data]) => {
                      const topCategory = Object.entries(data.categories || {})
                        .sort(([,a], [,b]) => b - a)[0];
                      return (
                        <tr key={userId}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {getUserDisplayName(userId)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatNumber(data.totalEvents)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {data.daysActive}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {topCategory ? `${topCategory[0]} (${formatNumber(topCategory[1])})` : 'N/A'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Events Tab */}
          {activeTab === 'events' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Event Types</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(analyticsData.eventTypeTotals || {})
                      .sort(([,a], [,b]) => b - a)
                      .map(([eventType, count]) => (
                        <div key={eventType} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="text-sm font-mono">{eventType}</span>
                          <span className="font-semibold">{formatNumber(count)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3">Languages</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {Object.entries(analyticsData.languageTotals || {})
                      .sort(([,a], [,b]) => b - a)
                      .map(([lang, count]) => (
                        <div key={lang} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                          <span className="text-sm">{lang}</span>
                          <span className="font-semibold">{formatNumber(count)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === 'trends' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Daily Trends</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="space-y-2">
                  {trendData.map((day, index) => (
                    <div key={day.date} className="flex items-center justify-between p-2 bg-white rounded">
                      <span className="text-sm font-medium">{day.displayName}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600">{formatNumber(day.events)} events</span>
                        <span className="text-sm text-gray-600">{formatNumber(day.users)} users</span>
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ 
                              width: `${Math.min(100, (day.events / Math.max(...trendData.map(d => d.events))) * 100)}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Button */}
      <div className="text-center">
        <button
          onClick={() => {
            const csv = [
              'date,events,users,categories,eventTypes,displayModes',
              ...trendData.map(day => 
                `${day.date},${day.events},${day.users},"${JSON.stringify(analyticsData.dailyBreakdown.find(d => d.date === day.date)?.categories || {})}","${JSON.stringify(analyticsData.dailyBreakdown.find(d => d.date === day.date)?.eventTypes || {})}","${JSON.stringify(analyticsData.dailyBreakdown.find(d => d.date === day.date)?.displayModes || {})}"`
              )
            ].join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pwa-analytics-${dateRange}-${selectedUser}-${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          📊 Export Analytics Data
        </button>
      </div>
    </div>
  );
}
