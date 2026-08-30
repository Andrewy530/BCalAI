import { Ionicons } from '@expo/vector-icons';
import { Pressable, type PressableProps, StyleSheet, type ViewStyle } from 'react-native';

import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Any Ionicons glyph name, e.g. "add", "chevron-back", "ellipsis-horizontal". */
  name: IconName;
  size?: number;
  tone?: 'default' | 'accent' | 'danger' | 'muted';
  /** Draws a circular surface behind the glyph. */
  filled?: boolean;
  /** Required: icon-only controls are invisible to screen readers without it. */
  accessibilityLabel: string;
  style?: ViewStyle;
}

export function IconButton({
  name,
  size = 22,
  tone = 'default',
  filled = false,
  disabled,
  style,
  ...rest
}: IconButtonProps) {
  const theme = useTheme();

  const color = {
    default: theme.colors.textPrimary,
    accent: theme.colors.accent,
    danger: theme.colors.danger,
    muted: theme.colors.textSecondary,
  }[tone];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={theme.hitSlopSize / 4}
      style={({ pressed }) => [
        styles.base,
        {
          width: theme.hitSlopSize,
          height: theme.hitSlopSize,
          borderRadius: theme.radius.pill,
          backgroundColor: filled ? theme.colors.surfaceElevated : 'transparent',
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        style,
      ]}
      {...rest}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
