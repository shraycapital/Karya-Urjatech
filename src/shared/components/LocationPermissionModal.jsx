import React from 'react';

const LocationPermissionModal = ({ onGrant, onDeny, isPermissionDenied }) => {
  const handleRequestPermission = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onGrant();
      },
      (error) => {
        onDeny();
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full text-center">
        <h2 className="text-2xl font-bold mb-4">Location Access Required</h2>
        <p className="text-gray-600 mb-6">
          This application requires access to your location to function correctly. Please grant permission to continue.
        </p>
        {isPermissionDenied && (
          <p className="text-red-500 mb-6">
            You have denied location access. You must enable it in your browser settings to use this app.
          </p>
        )}
        <button
          onClick={handleRequestPermission}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Grant Location Access
        </button>
      </div>
    </div>
  );
};

export default LocationPermissionModal;
