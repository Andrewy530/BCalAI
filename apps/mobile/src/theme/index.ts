/**
 * The app's theme is the design system's theme.
 *
 * Tokens live in `@cal/ui` so that the primitives there are self-contained and
 * a future web or admin surface can adopt the same scale. This module re-exports
 * them and is the only place app-level, product-specific palettes belong.
 */
export {
  PALETTE,
  ThemeProvider,
  darkTheme,
  lightTheme,
  motion,
  radius,
  spacing,
  themeFor,
  typography,
  useTheme,
  useThemedStyles,
  type ColorScheme,
  type ColorTokens,
  type Theme,
} from '@cal/ui';

/** Tone applied to a calendar event block by its sync state. */
export const SYNC_STATE_TONE = {
  synced: 'neutral',
  pending: 'accent',
  failed: 'danger',
  conflict: 'warning',
} as const;
