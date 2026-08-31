import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export interface ScreenProps {
  children: ReactNode;
  /** Wraps content in a ScrollView. Turn off for screens with their own list. */
  scrollable?: boolean;
  /** Applies the standard horizontal page inset. */
  padded?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Pinned above the safe-area bottom inset, e.g. a primary action. */
  footer?: ReactNode;
  contentStyle?: ViewStyle;
  testID?: string;
}

/**
 * Every screen starts here. It owns safe-area insets, the page background, the
 * status-bar style, and the standard page inset so individual screens never
 * re-derive them.
 */
export function Screen({
  children,
  scrollable = true,
  padded = true,
  onRefresh,
  refreshing = false,
  footer,
  contentStyle,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const inner: ViewStyle = {
    paddingHorizontal: padded ? theme.screenPadding : 0,
    paddingTop: insets.top + theme.spacing.sm,
    paddingBottom: footer ? theme.spacing.lg : insets.bottom + theme.spacing.xxl,
    gap: theme.spacing.lg,
  };

  return (
    <View testID={testID} style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />

      {scrollable ? (
        <ScrollView
          contentContainerStyle={[inner, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.textSecondary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.root, inner, contentStyle]}>{children}</View>
      )}

      {footer ? (
        <View
          style={{
            paddingHorizontal: theme.screenPadding,
            paddingTop: theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundElevated,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
