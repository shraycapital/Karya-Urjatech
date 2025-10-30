/**
 * Gets the current user's geographical location.
 * @returns {Promise<{latitude: number, longitude: number, accuracy: number | null, timestamp: number} | null>} A promise that resolves with the coordinates or null if not available.
 */
export const getCurrentLocation = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.log('Geolocation is not supported by this browser.');
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: typeof position.coords.accuracy === 'number' ? position.coords.accuracy : null,
          timestamp: position.timestamp || Date.now(),
        });
      },
      (error) => {
        console.log(`Could not get location: ${error.message}`);
        resolve(null); // Resolve with null on error/denial to not block the logging
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  });
};




























