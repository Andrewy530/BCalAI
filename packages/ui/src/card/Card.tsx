import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface CardProps extends ViewProps {
  /** Small uppercase eyebrow above the card title. */
  eyebrow?: string;
  title?: string;
  /** Rendered at the trailing edge of the header row. */
  headerAccessory?: ReactNode;
  padded?: boolean;
  elevated?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({
  eyebrow,
  title,
  headerAccessory,
  padded = true,
  elevated = false,
  onPress,
  children,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();

  const surface: ViewStyle = {
    backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: padded ? theme.spacing.lg : 0,
    ...theme.elevation.card,
  };

  const content = (
    <>
      {(eyebrow || title || headerAccessory) && (
        <View style={[styles.header, { marginBottom: theme.spacing.md }]}>
          <View style={styles.headerText}>
            {eyebrow ? (
              <Text variant="caption" color="tertiary" uppercase>
                {eyebrow}
              </Text>
            ) : null}
            {title ? <Text variant="title3">{title}</Text> : null}
          </View>
          {headerAccessory}
        </View>
      )}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          surface,
          pressed && { backgroundColor: theme.colors.surfacePressed },
          style,
        ]}
        {...rest}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[surface, style]} {...rest}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flexShrink: 1, gap: 2 },
});
