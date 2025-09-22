import { useEffect, useRef } from 'react';
import { logLocationData } from '../utils/locationTracker.js';

/**
 * Hook to automatically track location on button clicks
 * @param {string} userId - Current user ID
 * @param {string} userName - Current user name
 */
export const useLocationTracking = (userId, userName) => {
  const trackingRef = useRef(false);

  useEffect(() => {
    const effectiveUserName = userName || (userId ? `User-${userId.substring(0, 8)}` : null);
    if (!userId || !effectiveUserName || trackingRef.current) return;

    console.log('dYZ_ Location tracking initialized for:', { userId, userName: effectiveUserName });
    trackingRef.current = true;

    // Track all button clicks
    const handleButtonClick = (event) => {
      const target = event.target;

      // Check if it's a button or clickable element
      if (
        target.tagName === 'BUTTON' ||
        target.closest('button') ||
        target.getAttribute('role') === 'button' ||
        target.classList.contains('clickable')
      ) {
        const button = target.tagName === 'BUTTON' ? target : target.closest('button') || target;
        const elementId = button.id || button.className || 'unknown';
        const action = button.getAttribute('data-action') || 'button_click';

        // Get additional context
        const details = {
          elementText: button.textContent?.trim() || '',
          elementType: button.tagName.toLowerCase(),
          className: button.className,
          parentElement: button.parentElement?.tagName || 'unknown',
        };

        // Log location data
        console.log('dYZ_ Button clicked, logging location:', {
          action,
          elementId,
          userId,
          userName: effectiveUserName,
        });
        logLocationData(userId, effectiveUserName, action, elementId, details);
      }
    };

    // Track form submissions
    const handleFormSubmit = (event) => {
      const form = event.target;
      const formId = form.id || 'unknown_form';

      logLocationData(userId, effectiveUserName, 'form_submit', formId, {
        formAction: form.action || '',
        formMethod: form.method || 'post',
        formElements: Array.from(form.elements).map((el) => ({
          type: el.type,
          name: el.name,
          id: el.id,
        })),
      });
    };

    // Track task-related actions
    const handleTaskAction = (event) => {
      const target = event.target;
      const taskId =
        target.getAttribute('data-task-id') || target.closest('[data-task-id]')?.getAttribute('data-task-id');

      if (taskId) {
        const action = target.getAttribute('data-action') || 'task_action';
        logLocationData(userId, effectiveUserName, action, `task_${taskId}`, {
          taskId,
          elementText: target.textContent?.trim() || '',
          elementType: target.tagName.toLowerCase(),
        });
      }
    };

    // Add event listeners
    document.addEventListener('click', handleButtonClick, true);
    document.addEventListener('submit', handleFormSubmit, true);
    document.addEventListener('click', handleTaskAction, true);

    // Cleanup
    return () => {
      document.removeEventListener('click', handleButtonClick, true);
      document.removeEventListener('submit', handleFormSubmit, true);
      document.removeEventListener('click', handleTaskAction, true);
    };
  }, [userId, userName]);
};