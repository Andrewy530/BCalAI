import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { Button } from '../button/Button';
import type { IconName } from '../icons';
import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  /** One sentence. Say what the user can do, not that data is missing. */
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({
  icon = 'sparkles-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: theme.spacing.huge,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.accentSubtle,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={26} color={theme.colors.accent} />
      </View>

      <Text variant="title3" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" color="secondary" align="center">
          {message}
        </Text>
      ) : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" size="sm" onPress={onAction} />
      ) : null}
    </View>
  );
}
