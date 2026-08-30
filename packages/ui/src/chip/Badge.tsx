import { View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string | number;
  tone?: BadgeTone;
  style?: ViewStyle;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  const palette: Record<BadgeTone, { bg: string; fg: string }> = {
    neutral: { bg: theme.colors.surfaceElevated, fg: theme.colors.textSecondary },
    accent: { bg: theme.colors.accentSubtle, fg: theme.colors.accent },
    success: { bg: theme.colors.successSubtle, fg: theme.colors.success },
    warning: { bg: theme.colors.warningSubtle, fg: theme.colors.warning },
    danger: { bg: theme.colors.dangerSubtle, fg: theme.colors.danger },
  };

  return (
    <View
      style={[
        {
          minWidth: 22,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 2,
          borderRadius: theme.radius.pill,
          backgroundColor: palette[tone].bg,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text variant="caption" style={{ color: palette[tone].fg }}>
        {String(label)}
      </Text>
    </View>
  );
}
