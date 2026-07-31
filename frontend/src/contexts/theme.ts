import { createContext, useContext, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'gradtrack-theme';
export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)';

export interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setThemeMode: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedTheme) ? storedTheme : 'system';
  } catch {
    return 'system';
  }
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode;
}

export function applyTheme(mode: ThemeMode, resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = mode;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function useLightOnlyTheme() {
  useEffect(() => {
    applyTheme('light', 'light');

    return () => {
      const storedThemeMode = getStoredThemeMode();
      applyTheme(storedThemeMode, resolveTheme(storedThemeMode));
    };
  }, []);
}
