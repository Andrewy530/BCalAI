import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Right-aligned secondary text, e.g. a time or a count. */
  meta?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Thin colour bar at the leading edge — calendar or list colour. */
  accentColor?: string;
  showChevron?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  meta,
  leading,
  trailing,
  accentColor,
  showChevron = false,
  disabled = false,
  onPress,
  onLongPress,
  style,
  testID,
}: ListRowProps) {
  const theme = useTheme();

  const body = (
    <>
      {accentColor ? (
        <View
          style={[styles.accent, { backgroundColor: accentColor, borderRadius: theme.radius.pill }]}
        />
      ) : null}
      {leading ? <View>{leading}</View> : null}

      <View style={styles.text}>
        <Text variant="body" numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {meta ? (
        <Text variant="footnote" color="tertiary">
          {meta}
        </Text>
      ) : null}
      {trailing}
      {showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textTertiary} />
      ) : null}
    </>
  );

  const layout: ViewStyle = {
    minHeight: theme.hitSlopSize + theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.md,
    opacity: disabled ? 0.5 : 1,
  };

  if (!onPress && !onLongPress) {
    return (
      <View testID={testID} style={[styles.row, layout, style]}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        layout,
        pressed && { backgroundColor: theme.colors.surfacePressed },
        style,
      ]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, gap: 2 },
  accent: { width: 3, alignSelf: 'stretch' },
});
