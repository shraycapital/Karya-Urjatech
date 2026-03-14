import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'kartavya_desktop_mode';

/**
 * Hook for advanced desktop mode - a layout optimized for power users on desktop/large screens.
 * Persists per device/session via localStorage.
 * Inspired by Jira, Linear, and ticket resolution platforms.
 */
export function useDesktopMode() {
  const [isDesktopMode, setIsDesktopModeState] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isDesktopMode));
    } catch (e) {
      console.warn('Could not persist desktop mode preference:', e);
    }
  }, [isDesktopMode]);

  const setDesktopMode = useCallback((value) => {
    setIsDesktopModeState(Boolean(value));
  }, []);

  const toggleDesktopMode = useCallback(() => {
    setIsDesktopModeState((prev) => !prev);
  }, []);

  return { isDesktopMode, setDesktopMode, toggleDesktopMode };
}
