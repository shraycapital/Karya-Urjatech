import React, { useState, useEffect, useCallback } from 'react';
import Section from '../../../shared/components/Section.jsx';
import LocationHistoryView from './LocationHistoryView.jsx';
import { getUserLocationData, getUsersWithLocationData, getUsersLocationStats } from '../../../shared/utils/locationTracker.js';

const getDateRange = (days) => {
  const endDate = new Date();
  if (days === 'all') {
    return { startDate: new Date(0), endDate };
  }

  const parsedDays = Number(days || 1);
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - parsedDays);
  return { startDate, endDate };
};

const LocationsTab = ({ currentUser, users, departments, t }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [locationData, setLocationData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userStats, setUserStats] = useState({});

  const refreshLocationData = useCallback(async () => {
    if (!selectedUserId) return;
    setIsLoading(true);
    try {
      const { startDate, endDate } = getDateRange(dateRange);
      const data = await getUserLocationData(selectedUserId, startDate, endDate);
      setLocationData(data);
    } catch (error) {
      setLocationData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUserId, dateRange]);

  useEffect(() => {
    const loadUsers = async () => {
      // Guard Clause: Wait for props to be ready
      if (!users || users.length === 0 || !departments || departments.length === 0) {
        return;
      }
      
      try {
        let usersWithLocation = await getUsersWithLocationData();
        
        if (usersWithLocation.length === 0 && users.length > 0) {
          usersWithLocation = users.map(user => ({
            id: user.id,
            name: user.name || `User-${user.id.substring(0, 8)}`
          }));
        }
        
        const enhancedUsers = usersWithLocation.map(locationUser => {
          const fullUser = users.find(u => u.id === locationUser.id);
          return {
            ...locationUser,
            department: fullUser ? departments.find(d => d.id === fullUser.departmentIds?.[0])?.name || 'Unknown' : 'Unknown',
            role: fullUser?.role || 'Unknown',
            lastActive: fullUser?.lastActive || null,
            isOnline: fullUser?.isOnline || false
          };
        });

        const userIds = enhancedUsers.map(u => u.id);
        const { startDate, endDate } = getDateRange('all');
        const stats = await getUsersLocationStats(userIds, startDate, endDate);

        setAvailableUsers(enhancedUsers);
        setUserStats(stats);
        
        const usersWithData = enhancedUsers.filter(u => stats[u.id]?.totalLocations > 0);
        if (usersWithData.length > 0) {
          setSelectedUserId(usersWithData[0].id);
        } else if (enhancedUsers.length > 0) {
          setSelectedUserId(enhancedUsers[0].id);
        }
      } catch (error) {
        // Handle error silently
      }
    };

    loadUsers();
  }, [currentUser, users, departments]);

  useEffect(() => {
    if (selectedUserId) {
      refreshLocationData();
    }
  }, [selectedUserId, refreshLocationData]);

  const createTestLocationData = async () => {
    try {
      const { testLocationLogging } = await import('../../../shared/utils/locationTracker.js');
      
      // Create test data for the first few users
      const testUsers = availableUsers.slice(0, 3);
      for (const user of testUsers) {
        await testLocationLogging(user.id, user.name);
      }
      
      // Refresh the data
      await refreshLocationData();
    } catch (error) {
      // Handle error silently
    }
  };

  const exportAllLocationData = async () => {
    try {
      const { getAllLocationData } = await import('../../../shared/utils/locationTracker.js');
      
      // Get data for the selected date range
      const { startDate, endDate } = getDateRange(dateRange);
      const allLocationData = await getAllLocationData(startDate, endDate);
      
      if (allLocationData.length === 0) {
        alert('No location data found to export.');
        return;
      }
      
      // Prepare CSV data
      const csvHeaders = [
        'User ID',
        'User Name', 
        'Action',
        'Element ID',
        'Latitude',
        'Longitude',
        'Accuracy (m)',
        'Timestamp',
        'Details'
      ];
      
      const csvRows = allLocationData.map(record => [
        record.userId || '',
        record.userName || '',
        record.action || '',
        record.elementId || '',
        record.location?.latitude || '',
        record.location?.longitude || '',
        record.location?.accuracy || '',
        record.occurredAtISO || record.timestamp || '',
        record.details?.elementText || ''
      ]);
      
      // Create CSV content
      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
      ].join('\n');
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `location_data_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      alert('Error exporting location data. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      {availableUsers.length === 0 && !isLoading && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-blue-800">No Location Data Found</h3>
                <p className="text-xs text-blue-700 mt-1">Users are visible but no location data has been recorded yet. Location tracking starts when users interact with the app.</p>
              </div>
              <button
                onClick={createTestLocationData}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create Test Data
              </button>
            </div>
          </div>
        )}
      <LocationHistoryView
        records={locationData}
        availableUsers={availableUsers}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={refreshLocationData}
        onExportAll={exportAllLocationData}
        isLoading={isLoading}
        userStats={userStats}
        t={t}
        permissionState="unknown"
        mapId="location-tab-map"
        layout="tab"
      />
    </div>
  );
};

export default LocationsTab;
