/**
 * Semantic colour tokens.
 *
 * Components never reference a raw hex value — they name the *role* (`surface`,
 * `textSecondary`, `accent`). That is what makes a genuinely good dark mode
 * possible rather than a washed-out inversion of the light one.
 */
export interface ColorTokens {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceElevated: string;
  surfacePressed: string;
  border: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  accent: string;
  accentPressed: string;
  accentSubtle: string;
  onAccent: string;

  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  danger: string;
  dangerSubtle: string;

  /** Timeline furniture in the calendar views. */
  gridLine: string;
  nowIndicator: string;
  scrim: string;
}

export const darkColors: ColorTokens = {
  background: '#0B0B0F',
  backgroundElevated: '#101218',
  surface: '#15161C',
  surfaceElevated: '#1D1F27',
  surfacePressed: '#23262F',
  border: '#262832',
  borderStrong: '#333644',

  textPrimary: '#F2F3F7',
  textSecondary: '#9A9DAB',
  textTertiary: '#6B6E7C',
  textInverse: '#0B0B0F',

  accent: '#6E8BFF',
  accentPressed: '#5A78F0',
  accentSubtle: 'rgba(110, 139, 255, 0.16)',
  onAccent: '#FFFFFF',

  success: '#3ECF8E',
  successSubtle: 'rgba(62, 207, 142, 0.16)',
  warning: '#F5B759',
  warningSubtle: 'rgba(245, 183, 89, 0.16)',
  danger: '#FF6B6B',
  dangerSubtle: 'rgba(255, 107, 107, 0.16)',

  gridLine: '#1F2029',
  nowIndicator: '#FF6B6B',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

export const lightColors: ColorTokens = {
  background: '#F5F6FA',
  backgroundElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfacePressed: '#EDEFF5',
  border: '#E3E5ED',
  borderStrong: '#CDD1DE',

  textPrimary: '#13141A',
  textSecondary: '#5C6070',
  textTertiary: '#8B8F9E',
  textInverse: '#FFFFFF',

  accent: '#3D5CFF',
  accentPressed: '#2F4AE0',
  accentSubtle: 'rgba(61, 92, 255, 0.10)',
  onAccent: '#FFFFFF',

  success: '#12A66B',
  successSubtle: 'rgba(18, 166, 107, 0.12)',
  warning: '#C8811A',
  warningSubtle: 'rgba(200, 129, 26, 0.12)',
  danger: '#DE3B3B',
  dangerSubtle: 'rgba(222, 59, 59, 0.10)',

  gridLine: '#EBEDF3',
  nowIndicator: '#DE3B3B',
  scrim: 'rgba(15, 17, 26, 0.35)',
};

/** Palette offered when creating a calendar, list, or tag. */
export const PALETTE = [
  '#6E8BFF',
  '#3ECF8E',
  '#F5B759',
  '#FF6B6B',
  '#B476FF',
  '#39C0D6',
  '#FF8FB1',
  '#8C93A8',
] as const;
