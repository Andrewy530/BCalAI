import { Pressable, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface SectionHeaderProps {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({ title, count, actionLabel, onAction, style }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
        <Text variant="title3">{title}</Text>
        {count !== undefined ? (
          <Text variant="footnote" color="tertiary">
            {count}
          </Text>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text variant="subhead" color="accent">
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
