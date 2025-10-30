import { useEffect, useRef } from 'react';
import { logLocationData } from '../utils/locationTracker';

export const useLocationTracking = (userId, userName) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (userId && userName) {
      // Log location immediately on login
      logLocationData(userId, userName, 'app_open', 'initial_load');

      // Set up periodic tracking
      intervalRef.current = setInterval(() => {
        logLocationData(userId, userName, 'periodic_check', 'background_tracking');
      }, 2 * 60 * 1000); // 2 minutes
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [userId, userName]);
};
