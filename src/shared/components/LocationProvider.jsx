import React, { useState, useEffect } from 'react';
import { useLocationTracking } from '../hooks/useLocationTracker';
import LocationPermissionModal from './LocationPermissionModal';

const LocationProvider = ({ children, currentUser, currentUserName }) => {
  const [permissionStatus, setPermissionStatus] = useState('idle');

  useEffect(() => {
    if (currentUser) {
      setPermissionStatus('checking');
      navigator.permissions.query({ name: 'geolocation' }).then((permissionStatus) => {
        if (permissionStatus.state === 'granted') {
          setPermissionStatus('granted');
        } else {
          setPermissionStatus('denied');
        }
      });
    }
  }, [currentUser]);

  useLocationTracking(
    permissionStatus === 'granted' ? currentUser?.id : null,
    permissionStatus === 'granted' ? currentUserName : null
  );

  const handleGrant = () => setPermissionStatus('granted');
  const handleDeny = () => setPermissionStatus('denied');

  if (permissionStatus !== 'granted' && currentUser) {
    return (
      <LocationPermissionModal
        onGrant={handleGrant}
        onDeny={handleDeny}
        isPermissionDenied={permissionStatus === 'denied'}
      />
    );
  }

  return <>{children}</>;
};

export default LocationProvider;












