import React, { useState, useEffect, useCallback } from 'react';
import Modal from '../../../shared/components/Modal.jsx';
import LocationHistoryView from './LocationHistoryView.jsx';
import { getUserLocationData, getUsersWithLocationData } from '../../../shared/utils/locationTracker.js';

const getDateRange = (days) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days || 1));
  return { startDate, endDate };
};

const LocationsModal = ({ isOpen, onClose, currentUser, users, t }) => {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [dateRange, setDateRange] = useState('7');
  const [locationData, setLocationData] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionState, setPermissionState] = useState('unknown');

  const refreshLocationData = useCallback(async () => {
    if (!selectedUserId || !isOpen) return;
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
  }, [selectedUserId, dateRange, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const checkPermission = async () => {
      if (!navigator.geolocation || !navigator.permissions) {
        setPermissionState('not_supported');
        return;
      }
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        setPermissionState(permission.state);
      } catch (error) {
        setPermissionState('unknown');
      }
    };

    checkPermission();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const loadUsers = async () => {
      try {
        const usersWithLocation = await getUsersWithLocationData();
        setAvailableUsers(usersWithLocation);
        if (usersWithLocation.length > 0) {
          setSelectedUserId((prev) => {
            if (prev && usersWithLocation.some((u) => u.id === prev)) {
              return prev;
            }
            return usersWithLocation[0].id;
          });
        } else {
          setSelectedUserId('');
        }
      } catch (error) {
        setAvailableUsers([]);
        setSelectedUserId('');
      }
    };

    loadUsers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    refreshLocationData();
  }, [refreshLocationData, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('locationTracking') || 'Location Tracking'}>
      <LocationHistoryView
        records={locationData}
        availableUsers={availableUsers}
        selectedUserId={selectedUserId}
        onSelectUser={setSelectedUserId}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        onRefresh={refreshLocationData}
        isLoading={isLoading}
        t={t}
        permissionState={permissionState}
        mapId="location-modal-map"
        layout="modal"
      />
    </Modal>
  );
};

export default LocationsModal;
