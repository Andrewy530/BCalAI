import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { TextVariant } from '../theme/typography';

export type TextColor =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'inverse'
  | 'onAccent';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  /** Uppercases and applies the caption tracking. Use for section eyebrows. */
  uppercase?: boolean;
}

export function Text({
  variant = 'body',
  color = 'primary',
  align,
  uppercase,
  style,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const colorMap: Record<TextColor, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    accent: theme.colors.accent,
    success: theme.colors.success,
    warning: theme.colors.warning,
    danger: theme.colors.danger,
    inverse: theme.colors.textInverse,
    onAccent: theme.colors.onAccent,
  };

  return (
    <RNText
      {...rest}
      style={[
        theme.typography[variant],
        { color: colorMap[color] },
        align ? { textAlign: align } : null,
        uppercase ? { textTransform: 'uppercase' } : null,
        style,
      ]}
    />
  );
}
