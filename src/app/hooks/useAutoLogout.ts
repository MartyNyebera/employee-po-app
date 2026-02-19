import { useEffect } from 'react';
import { clearStoredAuth } from '../api/client';

export function useAutoLogout() {
  useEffect(() => {
    // Simple 30-minute inactivity timeout
    let sessionTimeout: ReturnType<typeof setTimeout>;

    const startTimeout = () => {
      clearTimeout(sessionTimeout);
      sessionTimeout = setTimeout(() => {
        clearStoredAuth();
        window.location.reload();
      }, 30 * 60 * 1000);
    };

    startTimeout();

    const activityEvents = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(event => window.addEventListener(event, startTimeout));

    return () => {
      clearTimeout(sessionTimeout);
      activityEvents.forEach(event => window.removeEventListener(event, startTimeout));
    };
  }, []);
}
