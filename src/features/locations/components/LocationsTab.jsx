import React, { useState, useEffect, useCallback } from 'react';
import Section from '../../../shared/components/Section.jsx';
import LocationHistoryView from './LocationHistoryView.jsx';
import { getUserLocationData, getUsersWithLocationData, getUsersLocationStats } from '../../../shared/utils/locationTracker.js';

const getDateRange = (days) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 1));
  return { startDate, endDate };
};

const LocationsTab = ({ currentUser, users, departments, t }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [locationData, setLocationData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [userStats, setUserStats] = useState({});

  const refreshLocationData = useCallback(async () => {
    if (!selectedUserId) return;
    setIsLoading(true);
    try {
      console.log('Refreshing location data for user:', selectedUserId, 'dateRange:', dateRange);
      const { startDate, endDate } = getDateRange(dateRange);
      console.log('Date range for fetch:', {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      });
      const data = await getUserLocationData(selectedUserId, startDate, endDate);
      console.log('Fetched data length:', data.length);
      if (data.length > 0) {
        console.log('Sample fetched record:', data[0]);
      } else {
        console.log('No data fetched - checking all records for user');
        const allData = await getUserLocationData(selectedUserId, new Date(0), new Date());
        console.log('Total records ever for user:', allData.length);
      }
      setLocationData(data);
    } catch (error) {
      console.error('Error loading location data:', error);
      setLocationData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUserId, dateRange]);

  useEffect(() => {
    const loadUsers = async () => {
      // Guard Clause: Wait for props to be ready
      if (!users || users.length === 0 || !departments || departments.length === 0) {
        console.warn('LocationsTab: Waiting for users and departments props...');
        return;
      }
      console.log('LocationsTab: loadUsers starting...');
      
      try {
        let usersWithLocation = await getUsersWithLocationData();
        console.log('LocationsTab: getUsersWithLocationData returned', usersWithLocation.length, 'users.');
        
        if (usersWithLocation.length === 0 && users.length > 0) {
          console.warn('LocationsTab: No users have location data. Falling back to all users.');
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
        const { startDate, endDate } = getDateRange('30');
        const stats = await getUsersLocationStats(userIds, startDate, endDate);
        
        console.log('LocationsTab: User stats calculated:', stats);

        setAvailableUsers(enhancedUsers);
        setUserStats(stats);
        
        const usersWithData = enhancedUsers.filter(u => stats[u.id]?.totalLocations > 0);
        if (usersWithData.length > 0) {
          const newUserId = usersWithData[0].id;
          console.log(`LocationsTab: Found ${usersWithData.length} users with data. Auto-selecting user:`, newUserId);
          setSelectedUserId(newUserId);
        } else if (enhancedUsers.length > 0) {
          const fallbackUserId = enhancedUsers[0].id;
          console.warn('LocationsTab: No users have location data. Selecting first available user as fallback:', fallbackUserId);
          setSelectedUserId(fallbackUserId);
        } else {
          console.error("LocationsTab: No users found to display.");
        }
      } catch (error) {
        console.error('LocationsTab: A critical error occurred in loadUsers:', error);
      }
    };

    loadUsers();
  }, [currentUser, users, departments]);

  useEffect(() => {
    // This effect now ONLY triggers when selectedUserId is set to a non-empty string.
    if (selectedUserId) {
      console.log(`LocationsTab: selectedUserId changed to: ${selectedUserId}. Triggering refresh.`);
      refreshLocationData();
    }
  }, [selectedUserId, refreshLocationData]);

  const createTestLocationData = async () => {
    try {
      console.log('Creating test location data...');
      const { testLocationLogging } = await import('../../../shared/utils/locationTracker.js');
      
      // Create test data for the first few users
      const testUsers = availableUsers.slice(0, 3);
      for (const user of testUsers) {
        await testLocationLogging(user.id, user.name);
        console.log(`Created test location data for ${user.name}`);
      }
      
      // Refresh the data
      await refreshLocationData();
    } catch (error) {
      console.error('Error creating test location data:', error);
    }
  };

  const exportAllLocationData = async () => {
    try {
      console.log(`Exporting all location data for date range: ${dateRange} days`);
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
      
      console.log(`Exported ${allLocationData.length} location records`);
    } catch (error) {
      console.error('Error exporting location data:', error);
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
