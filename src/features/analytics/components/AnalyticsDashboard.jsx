import React, { useState, useMemo, useEffect } from 'react';
import { formatDateTime, formatDateOnly } from '../../../shared/utils/date';
import { STATUSES, DIFFICULTY_CONFIG, ROLES } from '../../../shared/constants';

// Analytics Dashboard with comprehensive insights
export default function AnalyticsDashboard({ 
  tasks = [], 
  users = [], 
  departments = [], 
  currentUser, 
  t,
  activityLogs = [] 
}) {
  // Debug logging
  console.log('Analytics Dashboard Props:', {
    tasksCount: tasks.length,
    usersCount: users.length,
    departmentsCount: departments.length,
    activityLogsCount: activityLogs.length,
    currentUser: currentUser?.name
  });
  const [timeFrame, setTimeFrame] = useState('month'); // daily, week, month - default to month for more data
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    // Find the most recent period with data
    const now = new Date();
    const currentYear = now.getFullYear();
    
    // Try current month first
    const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return currentMonth;
  });
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [activeTab, setActiveTab] = useState('overview'); // overview, users, tasks, anomalies

  // Auto-adjust to a period with data if current period is empty
  useEffect(() => {
    if (tasks.length > 0) {
      // Find a period that has data
      const findPeriodWithData = () => {
        // Helper function to get task date with better parsing
        const getTaskDate = (task) => {
          if (!task) return null;
          
          // Try multiple date fields
          const dateFields = [
            task.createdAt, 
            task.timestamp, 
            task.created_at, 
            task.dateCreated,
            task.createdTime,
            task.updatedAt,
            task.updated_at,
            task.dateUpdated
          ];
          
          for (const dateField of dateFields) {
            if (dateField) {
              let parsed;
              
              // Handle Firestore Timestamp objects
              if (dateField && typeof dateField === 'object' && dateField.seconds) {
                parsed = new Date(dateField.seconds * 1000);
              } else if (dateField && typeof dateField === 'object' && dateField.toDate) {
                parsed = dateField.toDate();
              } else {
                parsed = new Date(dateField);
              }
              
              if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
                return parsed;
              }
            }
          }
          return null;
        };
        
        // Get all valid task dates
        const validTaskDates = tasks
          .map(task => getTaskDate(task))
          .filter(date => date !== null)
          .sort((a, b) => b - a); // Sort descending (most recent first)
        
        console.log('Valid task dates found:', validTaskDates.length, validTaskDates.slice(0, 5));
        
        if (validTaskDates.length === 0) {
          console.log('No valid task dates found');
          return;
        }
        
        // Use the most recent date to determine the period
        const mostRecentDate = validTaskDates[0];
        const year = mostRecentDate.getFullYear();
        const month = mostRecentDate.getMonth() + 1;
        const monthStr = `${year}-${String(month).padStart(2, '0')}`;
        
        console.log('Setting period to:', monthStr, 'based on most recent date:', mostRecentDate);
        
        setTimeFrame('month');
        setSelectedPeriod(monthStr);
      };
      
      findPeriodWithData();
    }
  }, [tasks]);

  // Time period helpers
  function getCurrentPeriod(frame) {
    const now = new Date();
    if (frame === 'daily') return now.toISOString().split('T')[0];
    if (frame === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return start.toISOString().split('T')[0];
    }
    if (frame === 'month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  // Filter data by time period
  const filteredData = useMemo(() => {
    console.log('Filtering data for period:', { timeFrame, selectedPeriod });
    
    const now = new Date();
    let startDate, endDate;

    try {
      if (timeFrame === 'daily') {
        startDate = new Date(selectedPeriod);
        endDate = new Date(selectedPeriod);
        endDate.setDate(endDate.getDate() + 1);
      } else if (timeFrame === 'week') {
        startDate = new Date(selectedPeriod);
        endDate = new Date(selectedPeriod);
        endDate.setDate(endDate.getDate() + 7);
      } else if (timeFrame === 'month') {
        const [year, month] = selectedPeriod.split('-');
        const yearNum = parseInt(year, 10);
        const monthNum = parseInt(month, 10);
        
        // Validate the parsed values
        if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
          console.error('Invalid month period:', selectedPeriod);
          startDate = new Date();
          endDate = new Date();
        } else {
          startDate = new Date(yearNum, monthNum - 1, 1);
          endDate = new Date(yearNum, monthNum, 1);
        }
      }

      console.log('Date range:', { startDate, endDate });

      const tasksInPeriod = (tasks || []).filter(task => {
        if (!task) return false;
        
        // Hide deleted tasks from regular users (only admins can see them)
        if (task.status === STATUSES.DELETED && currentUser.role !== ROLES.ADMIN) {
          return false;
        }
        
        // Try multiple possible date fields with better parsing
        let taskDate;
        const dateFields = [
          task.createdAt, 
          task.timestamp, 
          task.created_at, 
          task.dateCreated,
          task.createdTime,
          task.updatedAt,
          task.updated_at,
          task.dateUpdated
        ];
        
        // Find the first valid date
        for (const dateField of dateFields) {
          if (dateField) {
            let parsed;
            
            // Handle Firestore Timestamp objects
            if (dateField && typeof dateField === 'object' && dateField.seconds) {
              parsed = new Date(dateField.seconds * 1000);
            } else if (dateField && typeof dateField === 'object' && dateField.toDate) {
              parsed = dateField.toDate();
            } else {
              parsed = new Date(dateField);
            }
            
            if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
              taskDate = parsed;
              break;
            }
          }
        }
        
        // If no valid date found, use current time as fallback
        if (!taskDate) {
          taskDate = new Date();
        }
        
        const isValid = !isNaN(taskDate.getTime()) && taskDate >= startDate && taskDate < endDate;
        
        // Debug logging for first few tasks (with safe date handling)
        if (tasks.indexOf(task) < 3) {
          console.log('Task date check:', {
            taskTitle: task.title?.substring(0, 20),
            createdAt: task.createdAt,
            timestamp: task.timestamp,
            taskDate: isValid ? taskDate.toISOString() : 'Invalid Date',
            startDate: !isNaN(startDate.getTime()) ? startDate.toISOString() : 'Invalid Start Date',
            endDate: !isNaN(endDate.getTime()) ? endDate.toISOString() : 'Invalid End Date',
            isValid
          });
        }
        
        return isValid;
      });

      const logsInPeriod = (activityLogs || []).filter(log => {
        if (!log || !log.timestamp) return false;
        const logDate = new Date(log.timestamp);
        const isValid = !isNaN(logDate.getTime()) && logDate >= startDate && logDate < endDate;
        return isValid;
      });

      console.log('Filtered results:', {
        tasksInPeriod: tasksInPeriod.length,
        logsInPeriod: logsInPeriod.length,
        totalTasks: tasks.length,
        totalLogs: activityLogs.length
      });

      // Always return the filtered data, don't fall back to all tasks
      return { 
        tasks: tasksInPeriod, 
        logs: logsInPeriod, 
        startDate, 
        endDate,
        isFallback: false
      };
    } catch (error) {
      console.error('Error filtering data:', error);
      return { tasks: [], logs: [], startDate: now, endDate: now, isFallback: false };
    }
  }, [tasks, activityLogs, timeFrame, selectedPeriod]);

  // Core metrics calculation
  const metrics = useMemo(() => {
    const { tasks: periodTasks } = filteredData;
    console.log('Calculating metrics for tasks:', periodTasks.length);
    
    const totalTasks = periodTasks.length;
    const completedTasks = periodTasks.filter(t => t?.status === STATUSES.COMPLETE).length;
    const ongoingTasks = periodTasks.filter(t => t?.status === STATUSES.ONGOING).length;
    const pendingTasks = periodTasks.filter(t => t?.status === STATUSES.PENDING).length;
    const overdueTasks = periodTasks.filter(t => {
      if (!t.targetDate) return false;
      return new Date(t.targetDate) < new Date() && t.status !== STATUSES.COMPLETE;
    }).length;
    
    const urgentTasks = periodTasks.filter(t => t.isUrgent).length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks * 100).toFixed(1) : 0;

    // Point calculations
    const totalPoints = periodTasks
      .filter(t => t.status === STATUSES.COMPLETE)
      .reduce((sum, t) => sum + (t.points || 0), 0);

    // Average completion time
    const completedWithTimes = periodTasks.filter(t => 
      t.status === STATUSES.COMPLETE && t.createdAt && t.completedAt
    );
    const avgCompletionTime = completedWithTimes.length > 0
      ? completedWithTimes.reduce((sum, t) => {
          const created = new Date(t.createdAt);
          const completed = new Date(t.completedAt);
          return sum + (completed - created);
        }, 0) / completedWithTimes.length / (1000 * 60 * 60 * 24) // days
      : 0;

    return {
      totalTasks,
      completedTasks,
      ongoingTasks,
      pendingTasks,
      overdueTasks,
      urgentTasks,
      completionRate,
      totalPoints,
      avgCompletionTime: avgCompletionTime.toFixed(1)
    };
  }, [filteredData]);

  // User analytics
  const userAnalytics = useMemo(() => {
    const { tasks: periodTasks } = filteredData;
    
    return users.map(user => {
      const userTasks = periodTasks.filter(t => 
        (Array.isArray(t.assignedUserIds) && t.assignedUserIds.includes(user.id)) ||
        t.assignedUserId === user.id
      );

      const completed = userTasks.filter(t => t.status === STATUSES.COMPLETE).length;
      const pending = userTasks.filter(t => t.status === STATUSES.PENDING).length;
      const ongoing = userTasks.filter(t => t.status === STATUSES.ONGOING).length;
      const overdue = userTasks.filter(t => {
        if (!t.targetDate) return false;
        return new Date(t.targetDate) < new Date() && t.status !== STATUSES.COMPLETE;
      }).length;

      const points = userTasks
        .filter(t => t.status === STATUSES.COMPLETE)
        .reduce((sum, t) => sum + (t.points || 0), 0);

      const completionRate = userTasks.length > 0 ? (completed / userTasks.length * 100) : 0;

      // Activity score (based on task interactions)
      const activityScore = calculateActivityScore(user.id, periodTasks, filteredData.logs);

      return {
        ...user,
        taskCount: userTasks.length,
        completed,
        pending,
        ongoing,
        overdue,
        points,
        completionRate: completionRate.toFixed(1),
        activityScore,
        efficiency: calculateEfficiency(userTasks),
        qualityScore: calculateQualityScore(userTasks)
      };
    }).sort((a, b) => b.points - a.points);
  }, [users, filteredData]);

  // Anomaly detection
  const anomalies = useMemo(() => {
    return detectAnomalies(userAnalytics, filteredData, users);
  }, [userAnalytics, filteredData, users]);

  // Department analytics
  const departmentAnalytics = useMemo(() => {
    const { tasks: periodTasks } = filteredData;
    
    return departments.map(dept => {
      const deptTasks = periodTasks.filter(t => t.departmentId === dept.id);
      const deptUsers = users.filter(u => u.departmentIds?.includes(dept.id));
      
      const completed = deptTasks.filter(t => t.status === STATUSES.COMPLETE).length;
      const total = deptTasks.length;
      const points = deptTasks
        .filter(t => t.status === STATUSES.COMPLETE)
        .reduce((sum, t) => sum + (t.points || 0), 0);

      return {
        ...dept,
        taskCount: total,
        completed,
        completionRate: total > 0 ? (completed / total * 100).toFixed(1) : 0,
        points,
        userCount: deptUsers.length,
        avgPointsPerUser: deptUsers.length > 0 ? (points / deptUsers.length).toFixed(1) : 0
      };
    }).sort((a, b) => b.points - a.points);
  }, [departments, users, filteredData]);

  // Trend analysis
  const trends = useMemo(() => {
    return calculateTrends(tasks, timeFrame, selectedPeriod);
  }, [tasks, timeFrame, selectedPeriod]);

  // Show debug info if no data
  const showDebugInfo = tasks.length === 0 && users.length === 0;

  return (
    <div className="space-y-6 p-4">
      {/* Debug Info Panel */}
      {showDebugInfo && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">📊 Analytics Debug Information</h3>
          <div className="text-sm text-yellow-700 space-y-1">
            <p><strong>Tasks:</strong> {tasks.length} items</p>
            <p><strong>Users:</strong> {users.length} items</p>
            <p><strong>Departments:</strong> {departments.length} items</p>
            <p><strong>Activity Logs:</strong> {activityLogs.length} items</p>
            <p><strong>Current User:</strong> {currentUser?.name || 'Not set'}</p>
            <p><strong>Time Frame:</strong> {timeFrame}</p>
            <p><strong>Selected Period:</strong> {selectedPeriod}</p>
          </div>
          <div className="mt-3 p-3 bg-yellow-100 rounded text-xs">
            <p><strong>Firestore Connection Issue:</strong> The error "ERR_BLOCKED_BY_CLIENT" suggests that:</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>Ad blocker is blocking Firestore requests (most common)</li>
              <li>Browser security settings are preventing Firebase connections</li>
              <li>Corporate firewall is blocking googleapis.com</li>
            </ul>
            <p className="mt-2"><strong>Solution:</strong> Try disabling ad blocker or use incognito mode.</p>
          </div>
        </div>
      )}

      {/* No Data Notification */}
      {filteredData.tasks.length === 0 && tasks.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-yellow-600">⚠️</span>
            <p className="text-sm text-yellow-700">
              <strong>No tasks found in selected period:</strong> No tasks were created during the selected {timeFrame} period ({formatPeriodDisplay(selectedPeriod, timeFrame)}). 
              Try selecting a different time period or check if tasks have proper creation dates.
            </p>
          </div>
          {/* Debug Information */}
          <div className="mt-3 p-3 bg-yellow-100 rounded text-xs">
            <p><strong>Debug Info:</strong></p>
            <p>Selected period: {selectedPeriod} ({timeFrame})</p>
            <p>Date range: {filteredData.startDate && !isNaN(filteredData.startDate.getTime()) ? filteredData.startDate.toISOString().split('T')[0] : 'Invalid'} to {filteredData.endDate && !isNaN(filteredData.endDate.getTime()) ? filteredData.endDate.toISOString().split('T')[0] : 'Invalid'}</p>
            <p>Total tasks in system: {tasks.length}</p>
            {tasks.length > 0 && (
              <div>
                <p>Sample task dates:</p>
                <ul className="list-disc list-inside ml-2">
                  {tasks.slice(0, 3).map((task, i) => (
                    <li key={i}>
                      Task "{task.title?.substring(0, 20)}..." - {task.createdAt ? (() => { const d = new Date(task.createdAt); return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : 'Invalid Date'; })() : 'No date'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                // Show all data by setting a very wide date range
                setTimeFrame('month');
                setSelectedPeriod('2020-01'); // Very old date to capture all data
              }}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
            >
              Show All Data
            </button>
            <button
              onClick={() => {
                // Try to find a period with data
                const now = new Date();
                const lastMonth = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;
                setTimeFrame('month');
                setSelectedPeriod(lastMonth);
              }}
              className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              Try Last Month
            </button>
            <button
              onClick={() => {
                // Find the most recent month with data
                const validTaskDates = tasks
                  .map(task => {
                    const dateFields = [
                      task.createdAt, 
                      task.timestamp, 
                      task.created_at, 
                      task.dateCreated,
                      task.createdTime,
                      task.updatedAt,
                      task.updated_at,
                      task.dateUpdated
                    ];
                    
                    for (const dateField of dateFields) {
                      if (dateField) {
                        let parsed;
                        
                        // Handle Firestore Timestamp objects
                        if (dateField && typeof dateField === 'object' && dateField.seconds) {
                          parsed = new Date(dateField.seconds * 1000);
                        } else if (dateField && typeof dateField === 'object' && dateField.toDate) {
                          parsed = dateField.toDate();
                        } else {
                          parsed = new Date(dateField);
                        }
                        
                        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000) {
                          return parsed;
                        }
                      }
                    }
                    return null;
                  })
                  .filter(date => date !== null)
                  .sort((a, b) => b - a);
                
                if (validTaskDates.length > 0) {
                  const mostRecentDate = validTaskDates[0];
                  const year = mostRecentDate.getFullYear();
                  const month = mostRecentDate.getMonth() + 1;
                  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
                  setTimeFrame('month');
                  setSelectedPeriod(monthStr);
                  console.log('Found data period:', monthStr, 'with', validTaskDates.length, 'valid dates');
                } else {
                  console.log('No valid task dates found');
                }
              }}
              className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
            >
              Find Data Period
            </button>
          </div>
        </div>
      )}

      {/* No Data at All */}
      {tasks.length === 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <span className="text-red-600">🚨</span>
            <p className="text-sm text-red-700">
              <strong>No tasks available:</strong> There are no tasks in the system to analyze. 
              Create some tasks first to see analytics data.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          📊 Analytics Dashboard
        </h1>
        
        {/* Time Frame Selector */}
        <div className="flex flex-wrap gap-2">
          {['daily', 'week', 'month'].map(frame => (
            <button
              key={frame}
              onClick={() => {
                setTimeFrame(frame);
                setSelectedPeriod(getCurrentPeriod(frame));
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                timeFrame === frame
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {frame.charAt(0).toUpperCase() + frame.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
        <label className="text-sm font-medium text-gray-700">Period:</label>
        <input
          type={timeFrame === 'month' ? 'month' : 'date'}
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-3 py-1 border border-gray-300 rounded text-sm"
        />
        <div className="text-sm text-gray-600">
          {formatPeriodDisplay(selectedPeriod, timeFrame)}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: '📊 Overview', icon: '📊' },
            { id: 'users', label: '👥 User Analytics', icon: '👥' },
            { id: 'tasks', label: '📋 Task Analysis', icon: '📋' },
            { id: 'anomalies', label: '🚨 Anomalies', icon: '🚨' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab 
          metrics={metrics} 
          trends={trends} 
          departmentAnalytics={departmentAnalytics}
          timeFrame={timeFrame}
        />
      )}

      {activeTab === 'users' && (
        <UserAnalyticsTab 
          userAnalytics={userAnalytics} 
          departments={departments}
          timeFrame={timeFrame}
        />
      )}

      {activeTab === 'tasks' && (
        <TaskAnalysisTab 
          tasks={filteredData.tasks} 
          users={users} 
          departments={departments}
          metrics={metrics}
        />
      )}

      {activeTab === 'anomalies' && (
        <AnomaliesTab 
          anomalies={anomalies} 
          users={users} 
          timeFrame={timeFrame}
        />
      )}
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ metrics, trends, departmentAnalytics, timeFrame }) {
  return (
    <div className="space-y-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Tasks"
          value={metrics.totalTasks}
          icon="📋"
          trend={trends.tasksTrend}
        />
        <MetricCard
          title="Completion Rate"
          value={`${metrics.completionRate}%`}
          icon="✅"
          trend={trends.completionTrend}
        />
        <MetricCard
          title="Total Points"
          value={metrics.totalPoints}
          icon="⭐"
          trend={trends.pointsTrend}
        />
        <MetricCard
          title="Avg. Completion"
          value={`${metrics.avgCompletionTime}d`}
          icon="⏱️"
          trend={trends.timeTrend}
        />
      </div>

      {/* Status Breakdown */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Task Status Breakdown</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatusCard label="Completed" value={metrics.completedTasks} color="green" />
          <StatusCard label="Ongoing" value={metrics.ongoingTasks} color="blue" />
          <StatusCard label="Pending" value={metrics.pendingTasks} color="yellow" />
          <StatusCard label="Overdue" value={metrics.overdueTasks} color="red" />
        </div>
      </div>

      {/* Department Performance */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Department Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Department</th>
                <th className="text-center py-2">Tasks</th>
                <th className="text-center py-2">Completion Rate</th>
                <th className="text-center py-2">Points</th>
                <th className="text-center py-2">Avg Points/User</th>
              </tr>
            </thead>
            <tbody>
              {departmentAnalytics.map(dept => (
                <tr key={dept.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 font-medium">{dept.name}</td>
                  <td className="text-center py-2">{dept.taskCount}</td>
                  <td className="text-center py-2">{dept.completionRate}%</td>
                  <td className="text-center py-2">{dept.points}</td>
                  <td className="text-center py-2">{dept.avgPointsPerUser}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// User Analytics Tab Component
function UserAnalyticsTab({ userAnalytics, departments, timeFrame }) {
  const [sortBy, setSortBy] = useState('points');
  const [filterDept, setFilterDept] = useState('all');

  const filteredUsers = userAnalytics
    .filter(user => filterDept === 'all' || user.departmentIds?.includes(filterDept))
    .sort((a, b) => {
      if (sortBy === 'efficiency') return b.efficiency - a.efficiency;
      if (sortBy === 'completionRate') return b.completionRate - a.completionRate;
      if (sortBy === 'activityScore') return b.activityScore - a.activityScore;
      return b.points - a.points;
    });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm"
        >
          <option value="points">Sort by Points</option>
          <option value="completionRate">Sort by Completion Rate</option>
          <option value="efficiency">Sort by Efficiency</option>
          <option value="activityScore">Sort by Activity Score</option>
        </select>
        
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded text-sm"
        >
          <option value="all">All Departments</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
      </div>

      {/* User Performance Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-3 px-4">User</th>
                <th className="text-center py-3 px-2">Tasks</th>
                <th className="text-center py-3 px-2">Completed</th>
                <th className="text-center py-3 px-2">Rate</th>
                <th className="text-center py-3 px-2">Points</th>
                <th className="text-center py-3 px-2">Efficiency</th>
                <th className="text-center py-3 px-2">Quality</th>
                <th className="text-center py-3 px-2">Activity</th>
                <th className="text-center py-3 px-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user, index) => (
                <tr key={user.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-500' : 'bg-blue-500'
                      }`}>
                        {index < 3 ? '👑' : user.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.role}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-center py-3 px-2">{user.taskCount}</td>
                  <td className="text-center py-3 px-2">{user.completed}</td>
                  <td className="text-center py-3 px-2">{user.completionRate}%</td>
                  <td className="text-center py-3 px-2 font-medium">{user.points}</td>
                  <td className="text-center py-3 px-2">
                    <EfficiencyBadge score={user.efficiency} />
                  </td>
                  <td className="text-center py-3 px-2">
                    <QualityBadge score={user.qualityScore} />
                  </td>
                  <td className="text-center py-3 px-2">
                    <ActivityBadge score={user.activityScore} />
                  </td>
                  <td className="text-center py-3 px-2">
                    {user.overdue > 0 && (
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                        {user.overdue} overdue
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Task Analysis Tab Component
function TaskAnalysisTab({ tasks, users, departments, metrics }) {
  const tasksByDifficulty = useMemo(() => {
    const counts = {};
    Object.keys(DIFFICULTY_CONFIG).forEach(level => {
      counts[level] = tasks.filter(t => t.difficulty === level).length;
    });
    return counts;
  }, [tasks]);

  const overdueAnalysis = useMemo(() => {
    const overdueTasks = tasks.filter(t => {
      if (!t.targetDate) return false;
      return new Date(t.targetDate) < new Date() && t.status !== STATUSES.COMPLETE;
    });

    return overdueTasks.map(task => ({
      ...task,
      daysOverdue: Math.floor((new Date() - new Date(task.targetDate)) / (1000 * 60 * 60 * 24)),
      assignedUsers: task.assignedUserIds?.map(id => 
        users.find(u => u.id === id)?.name || 'Unknown'
      ).join(', ') || 'Unassigned'
    })).sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [tasks, users]);

  return (
    <div className="space-y-6">
      {/* Task Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Tasks by Difficulty</h3>
          <div className="space-y-3">
            {Object.entries(tasksByDifficulty).map(([level, count]) => (
              <div key={level} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${getDifficultyColor(level)}`}></span>
                  <span className="capitalize">{level}</span>
                </div>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Task Health</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span>On Track</span>
              <span className="text-green-600 font-medium">
                {metrics.completedTasks + metrics.ongoingTasks}
              </span>
            </div>
            <div className="flex justify-between">
              <span>At Risk</span>
              <span className="text-yellow-600 font-medium">{metrics.pendingTasks}</span>
            </div>
            <div className="flex justify-between">
              <span>Critical</span>
              <span className="text-red-600 font-medium">{metrics.overdueTasks}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Overdue Tasks */}
      {overdueAnalysis.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4 text-red-600">
            🚨 Overdue Tasks ({overdueAnalysis.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Task</th>
                  <th className="text-left py-2">Assigned To</th>
                  <th className="text-center py-2">Days Overdue</th>
                  <th className="text-center py-2">Priority</th>
                  <th className="text-center py-2">Department</th>
                </tr>
              </thead>
              <tbody>
                {overdueAnalysis.slice(0, 10).map(task => (
                  <tr key={task.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-medium">{task.title}</td>
                    <td className="py-2">{task.assignedUsers}</td>
                    <td className="text-center py-2">
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">
                        {task.daysOverdue}d
                      </span>
                    </td>
                    <td className="text-center py-2">
                      {task.isUrgent ? '🚨 Urgent' : '📋 Normal'}
                    </td>
                    <td className="text-center py-2">
                      {departments.find(d => d.id === task.departmentId)?.name || 'Unknown'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Anomalies Tab Component
function AnomaliesTab({ anomalies, users, timeFrame }) {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-red-800 mb-2">
          🚨 Suspicious Activity Detection
        </h3>
        <p className="text-sm text-red-700">
          The following patterns have been flagged for management review based on {timeFrame} analysis.
        </p>
      </div>

      {anomalies.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="text-green-600 text-4xl mb-2">✅</div>
          <h3 className="text-lg font-semibold text-green-800">All Clear!</h3>
          <p className="text-green-700">No suspicious activities detected in this period.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {anomalies.map((anomaly, index) => (
            <AnomalyCard key={index} anomaly={anomaly} users={users} />
          ))}
        </div>
      )}
    </div>
  );
}

// Helper Components
function MetricCard({ title, value, icon, trend }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
      {trend && (
        <div className={`mt-2 text-sm flex items-center ${
          trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-600'
        }`}>
          <span>{trend > 0 ? '↗️' : trend < 0 ? '↘️' : '➡️'}</span>
          <span className="ml-1">{Math.abs(trend)}% vs last period</span>
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, color }) {
  const colorClasses = {
    green: 'bg-green-100 text-green-800',
    blue: 'bg-blue-100 text-blue-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800'
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm">{label}</div>
    </div>
  );
}

function EfficiencyBadge({ score }) {
  const getColor = (score) => {
    if (score >= 80) return 'bg-green-100 text-green-800';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${getColor(score)}`}>
      {score.toFixed(0)}%
    </span>
  );
}

function QualityBadge({ score }) {
  const getColor = (score) => {
    if (score >= 4) return 'bg-green-100 text-green-800';
    if (score >= 3) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const stars = '⭐'.repeat(Math.round(score));

  return (
    <span className={`px-2 py-1 rounded text-xs ${getColor(score)}`}>
      {stars}
    </span>
  );
}

function ActivityBadge({ score }) {
  const getColor = (score) => {
    if (score >= 80) return 'bg-blue-100 text-blue-800';
    if (score >= 50) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${getColor(score)}`}>
      {score.toFixed(0)}
    </span>
  );
}

function AnomalyCard({ anomaly, users }) {
  const user = users.find(u => u.id === anomaly.userId);
  
  return (
    <div className="bg-white border border-red-200 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-600 font-bold">
              {anomaly.severity === 'high' ? '🚨' : anomaly.severity === 'medium' ? '⚠️' : 'ℹ️'}
            </span>
          </div>
          <div>
            <div className="font-medium text-gray-900">{anomaly.title}</div>
            <div className="text-sm text-gray-600">{anomaly.description}</div>
            {user && (
              <div className="text-sm text-gray-500 mt-1">
                User: <span className="font-medium">{user.name}</span> ({user.role})
              </div>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          anomaly.severity === 'high' ? 'bg-red-100 text-red-800' :
          anomaly.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {anomaly.severity.toUpperCase()}
        </span>
      </div>
      
      {anomaly.details && (
        <div className="mt-3 p-3 bg-gray-50 rounded text-sm">
          <strong>Details:</strong> {anomaly.details}
        </div>
      )}

      {anomaly.recommendation && (
        <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
          <strong>Recommendation:</strong> {anomaly.recommendation}
        </div>
      )}
    </div>
  );
}

// Utility Functions
function calculateActivityScore(userId, tasks, logs) {
  const userTasks = tasks.filter(t => 
    (Array.isArray(t.assignedUserIds) && t.assignedUserIds.includes(userId)) ||
    t.assignedUserId === userId
  );
  
  const userLogs = logs.filter(log => log.userId === userId);
  
  // Base score from task completion rate
  const completionRate = userTasks.length > 0 
    ? userTasks.filter(t => t.status === STATUSES.COMPLETE).length / userTasks.length * 100
    : 0;
  
  // Activity bonus from interactions
  const activityBonus = Math.min(userLogs.length * 2, 30);
  
  return Math.min(completionRate + activityBonus, 100);
}

function calculateEfficiency(tasks) {
  if (tasks.length === 0) return 0;
  
  const completedOnTime = tasks.filter(t => {
    if (t.status !== STATUSES.COMPLETE || !t.targetDate || !t.completedAt) return false;
    return new Date(t.completedAt) <= new Date(t.targetDate);
  }).length;
  
  return (completedOnTime / tasks.length) * 100;
}

function calculateQualityScore(tasks) {
  if (tasks.length === 0) return 0;
  
  // Quality based on completion without delays and minimal back-and-forth
  const completedTasks = tasks.filter(t => t.status === STATUSES.COMPLETE);
  if (completedTasks.length === 0) return 0;
  
  const avgQuality = completedTasks.reduce((sum, task) => {
    let score = 5; // Start with perfect score
    
    // Deduct for overdue completion
    if (task.targetDate && task.completedAt && new Date(task.completedAt) > new Date(task.targetDate)) {
      score -= 1;
    }
    
    // Deduct for excessive comments (indicates confusion/issues)
    if (task.comments && task.comments.length > 5) {
      score -= 0.5;
    }
    
    return sum + Math.max(score, 1);
  }, 0);
  
  return avgQuality / completedTasks.length;
}

function detectAnomalies(userAnalytics, filteredData, users) {
  const anomalies = [];
  const { tasks, logs } = filteredData;
  
  userAnalytics.forEach(user => {
    // Detect unusually low activity
    if (user.taskCount > 0 && user.completionRate < 20) {
      anomalies.push({
        userId: user.id,
        severity: 'high',
        title: 'Extremely Low Completion Rate',
        description: `${user.name} has completed only ${user.completionRate}% of assigned tasks`,
        details: `Out of ${user.taskCount} assigned tasks, only ${user.completed} were completed`,
        recommendation: 'Consider workload redistribution or performance review'
      });
    }
    
    // Detect excessive overdue tasks
    if (user.overdue > 3) {
      anomalies.push({
        userId: user.id,
        severity: 'medium',
        title: 'Multiple Overdue Tasks',
        description: `${user.name} has ${user.overdue} overdue tasks`,
        recommendation: 'Urgent intervention required to clear backlog'
      });
    }
    
    // Detect unusual activity patterns
    const userLogs = logs.filter(log => log.userId === user.id);
    const uniqueDays = new Set(userLogs.map(log => 
      new Date(log.timestamp).toDateString()
    )).size;
    
    if (userLogs.length > 50 && uniqueDays <= 2) {
      anomalies.push({
        userId: user.id,
        severity: 'medium',
        title: 'Unusual Activity Pattern',
        description: `${user.name} has high activity concentrated in very few days`,
        details: `${userLogs.length} activities across only ${uniqueDays} days`,
        recommendation: 'Review work pattern for potential issues'
      });
    }
    
    // Detect zero activity
    if (user.taskCount === 0 && userLogs.length === 0) {
      anomalies.push({
        userId: user.id,
        severity: 'low',
        title: 'No Activity Detected',
        description: `${user.name} shows no task or system activity`,
        recommendation: 'Check if user is on leave or needs task assignment'
      });
    }
  });
  
  return anomalies.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

function calculateTrends(tasks, timeFrame, selectedPeriod) {
  // Compare with previous period
  const now = new Date();
  let currentStart, currentEnd, prevStart, prevEnd;
  
  if (timeFrame === 'daily') {
    currentStart = new Date(selectedPeriod);
    currentEnd = new Date(selectedPeriod);
    currentEnd.setDate(currentEnd.getDate() + 1);
    
    prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = new Date(currentStart);
  } else if (timeFrame === 'week') {
    currentStart = new Date(selectedPeriod);
    currentEnd = new Date(selectedPeriod);
    currentEnd.setDate(currentEnd.getDate() + 7);
    
    prevStart = new Date(currentStart);
    prevStart.setDate(prevStart.getDate() - 7);
    prevEnd = new Date(currentStart);
  } else if (timeFrame === 'month') {
    const [year, month] = selectedPeriod.split('-');
    currentStart = new Date(year, month - 1, 1);
    currentEnd = new Date(year, month, 1);
    
    prevStart = new Date(year, month - 2, 1);
    prevEnd = new Date(year, month - 1, 1);
  }
  
  const currentTasks = tasks.filter(t => {
    const taskDate = new Date(t.createdAt || t.timestamp);
    return taskDate >= currentStart && taskDate < currentEnd;
  });
  
  const prevTasks = tasks.filter(t => {
    const taskDate = new Date(t.createdAt || t.timestamp);
    return taskDate >= prevStart && taskDate < prevEnd;
  });
  
  const calculateTrend = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };
  
  return {
    tasksTrend: calculateTrend(currentTasks.length, prevTasks.length),
    completionTrend: calculateTrend(
      currentTasks.filter(t => t.status === STATUSES.COMPLETE).length,
      prevTasks.filter(t => t.status === STATUSES.COMPLETE).length
    ),
    pointsTrend: calculateTrend(
      currentTasks.filter(t => t.status === STATUSES.COMPLETE).reduce((sum, t) => sum + (t.points || 0), 0),
      prevTasks.filter(t => t.status === STATUSES.COMPLETE).reduce((sum, t) => sum + (t.points || 0), 0)
    )
  };
}

function formatPeriodDisplay(period, timeFrame) {
  try {
    if (timeFrame === 'daily') {
      const date = new Date(period);
      return isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
    } else if (timeFrame === 'week') {
      const start = new Date(period);
      if (isNaN(start.getTime())) return 'Invalid Date';
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    } else if (timeFrame === 'month') {
      const [year, month] = period.split('-');
      const yearNum = parseInt(year, 10);
      const monthNum = parseInt(month, 10);
      
      if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
        return 'Invalid Month';
      }
      
      const date = new Date(yearNum, monthNum - 1);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    }
  } catch (error) {
    console.error('Error formatting period display:', error);
    return 'Invalid Period';
  }
}

function getDifficultyColor(level) {
  const colors = {
    easy: 'bg-green-500',
    medium: 'bg-blue-500',
    hard: 'bg-orange-500',
    critical: 'bg-red-500'
  };
  return colors[level] || 'bg-gray-500';
}
