import { ActivityIndicator, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface LoadingStateProps {
  label?: string;
  /** Fills its parent rather than sitting inline. */
  fullScreen?: boolean;
  style?: ViewStyle;
}

export function LoadingState({ label, fullScreen = false, style }: LoadingStateProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={[
        {
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing.huge,
        },
        fullScreen && { flex: 1 },
        style,
      ]}
    >
      <ActivityIndicator color={theme.colors.textSecondary} />
      {label ? (
        <Text variant="footnote" color="tertiary">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Neutral placeholder block, sized by the caller, for skeleton layouts. */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        { height, width, borderRadius: theme.radius.sm, backgroundColor: theme.colors.surfaceElevated },
        style,
      ]}
    />
  );
}
