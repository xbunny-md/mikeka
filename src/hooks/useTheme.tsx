import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useFirebase } from '../firebase/auth/AuthContext.tsx';
import { updateUserPreferences } from '../firebase/firestore/repository.ts';
import type { ThemeMode } from '../types/sportybet.ts';

const THEME_STORAGE_KEY = 'odds_hunter_theme';

interface ThemeContextValue {
  theme: ThemeMode;
  isDark: boolean;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyThemeToDocument(mode: ThemeMode): void {
  const isDark = mode === 'dark';
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useFirebase();
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme);
  const lastHydratedUidRef = useRef<string | null>(null);

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  // Restore saved theme from Firestore profile once when user signs in
  useEffect(() => {
    if (!user) {
      lastHydratedUidRef.current = null;
      return;
    }
    if (
      profile?.themePreference &&
      (profile.themePreference === 'dark' || profile.themePreference === 'light') &&
      lastHydratedUidRef.current !== user.uid
    ) {
      lastHydratedUidRef.current = user.uid;
      setThemeState(profile.themePreference);
    }
  }, [profile?.themePreference, user]);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setThemeState(next);
      applyThemeToDocument(next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage errors
      }
      if (user) {
        lastHydratedUidRef.current = user.uid;
        void updateUserPreferences(user.uid, { themePreference: next }).catch(() => {});
      }
    },
    [user]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
