import { Platform, type TextStyle } from 'react-native';

/**
 * One type scale for the whole product. Adding a new variant is a design
 * decision, not a styling shortcut — reach for an existing one first.
 */
export type TextVariant =
  | 'display'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'bodyStrong'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'mono';

const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const monoFont = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const typography: Record<TextVariant, TextStyle> = {
  display: { fontFamily: systemFont, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.6 },
  title1: { fontFamily: systemFont, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  title2: { fontFamily: systemFont, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title3: { fontFamily: systemFont, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.2 },
  headline: { fontFamily: systemFont, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: systemFont, fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontFamily: systemFont, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  callout: { fontFamily: systemFont, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  subhead: { fontFamily: systemFont, fontSize: 14, lineHeight: 19, fontWeight: '500' },
  footnote: { fontFamily: systemFont, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontFamily: systemFont, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.4 },
  mono: { fontFamily: monoFont, fontSize: 13, lineHeight: 18, fontWeight: '400' },
};
