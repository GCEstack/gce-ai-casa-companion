import { useState, useCallback, useEffect } from 'react';

const USER_NAME_KEY = 'casa_user_name';
const USERNAME_ASKED_KEY = 'casa_username_asked';

export interface UseUserNameReturn {
  userName: string | null;
  hasAsked: boolean;
  setUserName: (name: string) => void;
  clearUserName: () => void;
}

export function useUserName(): UseUserNameReturn {
  const [userName, setUserNameState] = useState<string | null>(null);
  const [hasAsked, setHasAsked] = useState(false);

  // Load on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(USER_NAME_KEY);
      const asked = localStorage.getItem(USERNAME_ASKED_KEY) === 'true';
      if (stored) setUserNameState(stored);
      setHasAsked(asked);
    } catch {
      /* localStorage blocked */
    }
  }, []);

  const setUserName = useCallback((name: string) => {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      try {
        localStorage.setItem(USER_NAME_KEY, trimmed);
        localStorage.setItem(USERNAME_ASKED_KEY, 'true');
      } catch {
        /* ignore */
      }
      setUserNameState(trimmed);
      setHasAsked(true);
    }
  }, []);

  const clearUserName = useCallback(() => {
    try {
      localStorage.removeItem(USER_NAME_KEY);
      localStorage.removeItem(USERNAME_ASKED_KEY);
    } catch {
      /* ignore */
    }
    setUserNameState(null);
    setHasAsked(false);
  }, []);

  return { userName, hasAsked, setUserName, clearUserName };
}
