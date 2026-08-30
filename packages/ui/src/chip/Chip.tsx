import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import type { IconName } from '../icons';
import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface ChipProps {
  label: string;
  selected?: boolean;
  /** Overrides the accent colour, e.g. a tag's own colour. */
  color?: string;
  icon?: IconName;
  onPress?: () => void;
  onRemove?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected = false, color, icon, onPress, onRemove, style }: ChipProps) {
  const theme = useTheme();
  const tint = color ?? theme.colors.accent;

  const container: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    height: 32,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: selected ? tint : theme.colors.border,
    backgroundColor: selected ? theme.colors.accentSubtle : theme.colors.surface,
  };

  const content = (
    <>
      {icon ? <Ionicons name={icon} size={14} color={selected ? tint : theme.colors.textSecondary} /> : null}
      <Text variant="subhead" style={{ color: selected ? tint : theme.colors.textSecondary }}>
        {label}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} hitSlop={8}>
          <Ionicons name="close" size={14} color={theme.colors.textTertiary} />
        </Pressable>
      ) : null}
    </>
  );

  if (!onPress) return <View style={[container, style]}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [container, pressed && { opacity: 0.7 }, style]}
    >
      {content}
    </Pressable>
  );
}
