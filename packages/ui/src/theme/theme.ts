import { type ColorTokens, darkColors, lightColors } from './colors';
import { elevation, motion, radius, spacing } from './tokens';
import { typography } from './typography';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  typography: typeof typography;
  /** Standard horizontal page inset. Cards align to this. */
  screenPadding: number;
  /** Minimum tappable size, per Apple's HIG. */
  hitSlopSize: number;
}

const base = {
  spacing,
  radius,
  elevation,
  motion,
  typography,
  screenPadding: spacing.lg,
  hitSlopSize: 44,
} as const;

export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...base };
export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...base };

export const themeFor = (scheme: ColorScheme): Theme =>
  scheme === 'dark' ? darkTheme : lightTheme;
