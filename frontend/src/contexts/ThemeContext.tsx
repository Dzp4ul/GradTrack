import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyTheme,
  getStoredThemeMode,
  isThemeMode,
  resolveTheme,
  SYSTEM_DARK_QUERY,
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeMode,
} from './theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => getStoredThemeMode());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getStoredThemeMode())
  );

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // localStorage may be unavailable in private or restricted contexts.
    }

    const nextResolvedTheme = resolveTheme(mode);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(mode, nextResolvedTheme);
  }, []);

  useEffect(() => {
    const nextResolvedTheme = resolveTheme(themeMode);
    setResolvedTheme(nextResolvedTheme);
    applyTheme(themeMode, nextResolvedTheme);

    if (themeMode !== 'system' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(SYSTEM_DARK_QUERY);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      const systemTheme = event.matches ? 'dark' : 'light';
      setResolvedTheme(systemTheme);
      applyTheme('system', systemTheme);
    };

    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [themeMode]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isThemeMode(event.newValue)) return;
      setThemeModeState(event.newValue);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const value = useMemo(
    () => ({ themeMode, resolvedTheme, setThemeMode }),
    [resolvedTheme, setThemeMode, themeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
