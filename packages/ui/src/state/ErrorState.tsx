import { Ionicons } from '@expo/vector-icons';
import { View, type ViewStyle } from 'react-native';

import { Button } from '../button/Button';
import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface ErrorStateProps {
  title?: string;
  /** User-safe copy. Never render a provider payload or stack trace here. */
  message?: string;
  /** Stable code shown small, so support can match it to a log line. */
  code?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Check your connection and try again.',
  code,
  onRetry,
  style,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.xxxl,
          paddingHorizontal: theme.spacing.xl,
        },
        style,
      ]}
    >
      <Ionicons name="alert-circle-outline" size={30} color={theme.colors.danger} />
      <Text variant="title3" align="center">
        {title}
      </Text>
      <Text variant="callout" color="secondary" align="center">
        {message}
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />
      ) : null}
      {code ? (
        <Text variant="mono" color="tertiary">
          {code}
        </Text>
      ) : null}
    </View>
  );
}
