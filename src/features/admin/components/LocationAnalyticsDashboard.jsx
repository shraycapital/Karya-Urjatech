import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { getUsersWithLocationData, getUserLocationData } from '../../../shared/utils/locationTracker';

const LocationAnalyticsDashboard = ({ users, t }) => {
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateRange, setDateRange] = useState('today');
  const [locationData, setLocationData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      const usersWithData = await getUsersWithLocationData();
      const mappedUsers = usersWithData.map(u => {
        const fullUser = users.find(user => user.id === u.id);
        return { ...u, ...fullUser };
      });
      setAvailableUsers(mappedUsers);
      if (mappedUsers.length > 0) {
        setSelectedUserId(mappedUsers[0].id);
      }
    };
    loadUsers();
  }, [users]);

  useEffect(() => {
    if (!selectedUserId) return;

    const loadLocationData = async () => {
      setIsLoading(true);
      const { startDate, endDate } = getDateRange();
      const data = await getUserLocationData(selectedUserId, startDate, endDate);
      setLocationData(data);
      setIsLoading(false);
    };

    loadLocationData();
  }, [selectedUserId, dateRange]);

  const getDateRange = () => {
    const endDate = new Date();
    let startDate = new Date();
    switch (dateRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'last7days':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'last30days':
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate = new Date(0);
    }
    return { startDate, endDate };
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Location Analytics</h2>
        <div className="flex space-x-4">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="border rounded px-3 py-1"
          >
            {availableUsers.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border rounded px-3 py-1"
          >
            <option value="today">Today</option>
            <option value="last7days">Last 7 Days</option>
            <option value="last30days">Last 30 Days</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6" style={{ height: '600px' }}>
        {isLoading ? (
          <div className="w-full h-full bg-gray-200 flex items-center justify-center">
            <p className="text-gray-500">Loading map...</p>
          </div>
        ) : (
          <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {locationData.map(record => (
              <Marker key={record.id} position={[record.location.latitude, record.location.longitude]}>
                <Popup>
                  <strong>{record.userName}</strong><br />
                  Action: {record.action}<br />
                  Timestamp: {record.createdAt ? new Date(record.createdAt.seconds * 1000).toLocaleString() : 'N/A'}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
};

export default LocationAnalyticsDashboard;
