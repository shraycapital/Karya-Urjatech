import { useState, useRef, useCallback, useEffect } from 'react';

export const useSmartRefresh = (refreshFunctions = {}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isPulling = useRef(false);
  const pullDistance = useRef(0);
  const threshold = 80; // Minimum pull distance to trigger refresh

  // Smart refresh function that only updates what's needed
  const performSmartRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    setRefreshProgress(0);
    
    try {
      const refreshTasks = [];
      
      // Add refresh functions based on what's available
      if (refreshFunctions.tasks) {
        refreshTasks.push(() => refreshFunctions.tasks());
      }
      if (refreshFunctions.users) {
        refreshTasks.push(() => refreshFunctions.users());
      }
      if (refreshFunctions.departments) {
        refreshTasks.push(() => refreshFunctions.departments());
      }
      if (refreshFunctions.notifications) {
        refreshTasks.push(() => refreshFunctions.notifications());
      }
      if (refreshFunctions.activityLogs) {
        refreshTasks.push(() => refreshFunctions.activityLogs());
      }

      // Execute refresh tasks with progress updates
      for (let i = 0; i < refreshTasks.length; i++) {
        await refreshTasks[i]();
        setRefreshProgress(((i + 1) / refreshTasks.length) * 100);
      }

      setLastRefresh(new Date());
      console.log('Smart refresh completed successfully');
      
    } catch (error) {
      console.error('Smart refresh failed:', error);
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(0);
    }
  }, [refreshFunctions, isRefreshing]);

  // Force refresh everything (for manual refresh)
  const forceRefresh = useCallback(async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    setRefreshProgress(0);
    
    try {
      // Force refresh all data
      const allRefreshTasks = Object.values(refreshFunctions).filter(Boolean);
      
      for (let i = 0; i < allRefreshTasks.length; i++) {
        await allRefreshTasks[i]();
        setRefreshProgress(((i + 1) / allRefreshTasks.length) * 100);
      }

      setLastRefresh(new Date());
      console.log('Force refresh completed successfully');
      
    } catch (error) {
      console.error('Force refresh failed:', error);
    } finally {
      setIsRefreshing(false);
      setRefreshProgress(0);
    }
  }, [refreshFunctions, isRefreshing]);

  // Touch event handlers for pull-to-refresh
  const handleTouchStart = useCallback((e) => {
    if (window.scrollY === 0) { // Only at top of page
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
      isPulling.current = true;
      pullDistance.current = 0;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isPulling.current || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const distance = currentY - touchStartY.current;
    
    if (distance > 0) { // Only allow downward pull
      pullDistance.current = Math.min(distance, threshold * 2);
      e.preventDefault(); // Prevent default scroll
    }
  }, [isRefreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isPulling.current || isRefreshing) return;
    
    const pullTime = Date.now() - touchStartTime.current;
    const isQuickPull = pullTime < 300 && pullDistance.current > threshold;
    
    if (isQuickPull) {
      performSmartRefresh();
    }
    
    isPulling.current = false;
    pullDistance.current = 0;
  }, [isRefreshing, performSmartRefresh]);

  // Set up touch event listeners
  useEffect(() => {
    const element = document.documentElement;
    
    element.addEventListener('touchstart', handleTouchStart, { passive: false });
    element.addEventListener('touchmove', handleTouchMove, { passive: false });
    element.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isRefreshing,
    refreshProgress,
    lastRefresh,
    performSmartRefresh,
    forceRefresh,
    pullDistance: pullDistance.current
  };
};
