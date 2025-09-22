import React, { useState, useEffect, useCallback } from 'react';

export default function LocationPermission({ children, onLocationDenied }) {
  const [locationStatus, setLocationStatus] = useState('checking');
  const [locationError, setLocationError] = useState(null);

  const requestAndCheckPermission = useCallback(async () => {
    if (!navigator.geolocation || !navigator.permissions) {
      setLocationStatus('not-supported');
      return;
    }

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });

      const handlePermissionState = (state) => {
        if (state === 'granted') {
          setLocationStatus('granted');
          setLocationError(null);
        } else if (state === 'denied') {
          setLocationStatus('denied');
          setLocationError('Location access is denied. Please enable it in your browser settings to continue.');
          if (onLocationDenied) onLocationDenied();
        } else {
          // Explicitly prompt the user if permission is not determined
          navigator.geolocation.getCurrentPosition(
            () => handlePermissionState('granted'),
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                handlePermissionState('denied');
              } else {
                setLocationStatus('error');
                setLocationError('Could not determine your location. Please check device settings.');
              }
            },
            { timeout: 15000, enableHighAccuracy: true }
          );
        }
      };

      permission.onchange = () => handlePermissionState(permission.state);
      handlePermissionState(permission.state);

    } catch (error) {
      console.error('Error handling location permission:', error);
      // Fallback for browsers that might not support permissions.query smoothly
      if (error instanceof TypeError) {
         navigator.geolocation.getCurrentPosition(
            () => setLocationStatus('granted'),
            () => setLocationStatus('denied')
         );
      } else {
        setLocationStatus('error');
        setLocationError('An unexpected error occurred while checking location permissions.');
      }
    }
  }, [onLocationDenied]);

  useEffect(() => {
    requestAndCheckPermission();
  }, [requestAndCheckPermission]);


  const handleTryAgain = () => {
    // Directly re-trigger the permission request flow
    setLocationStatus('checking');
    requestAndCheckPermission();
  };

  if (locationStatus === 'checking') {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg text-gray-700">Checking location permission...</p>
        </div>
      </div>
    );
  }

  if (locationStatus === 'denied' || locationStatus === 'error') {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="max-w-md mx-auto text-center p-6">
          <div className="text-6xl mb-4">📍</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Location Required</h1>
          <p className="text-gray-600 mb-6">{locationError}</p>
          
          {(locationStatus === 'denied' || locationStatus === 'error') && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-left">
                <h3 className="font-medium text-yellow-800 mb-2">How to enable location:</h3>
                <ol className="text-sm text-yellow-700 space-y-1 list-decimal list-inside">
                  <li>Find the lock/info icon (usually left of the URL) in your browser's address bar.</li>
                  <li>Click it and find the "Location" permission.</li>
                  <li>Change the setting to "Allow".</li>
                  <li>You may need to refresh the page after changing the setting.</li>
                </ol>
              </div>
              
              <button
                onClick={handleTryAgain}
                className="w-full bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (locationStatus === 'not-supported') {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="max-w-md mx-auto text-center p-6">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Browser Not Supported</h1>
          <p className="text-gray-600 mb-6">
            Your browser doesn't support location services. Please use a modern browser or enable location services.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Location permission granted, render children
  return children;
}





