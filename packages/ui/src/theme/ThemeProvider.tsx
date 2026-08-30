import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { type ColorScheme, type Theme, themeFor } from './theme';

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  /** Omit to follow the system appearance. */
  scheme?: ColorScheme;
}

export function ThemeProvider({ children, scheme }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolved: ColorScheme = scheme ?? (systemScheme === 'light' ? 'light' : 'dark');
  const theme = useMemo(() => themeFor(resolved), [resolved]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/**
 * Build a StyleSheet from the current theme.
 *
 * Prefer this over inline styles so styles are still created once per theme
 * rather than on every render.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
