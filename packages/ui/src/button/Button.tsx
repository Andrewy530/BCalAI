import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: withSpring(1 - pressed.value * (1 - theme.motion.pressScale), theme.motion.spring) },
    ],
  }));

  const surface: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.accent },
    secondary: {
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    destructive: { backgroundColor: theme.colors.dangerSubtle },
  };

  const labelColor = {
    primary: 'onAccent',
    secondary: 'primary',
    ghost: 'accent',
    destructive: 'danger',
  } as const;

  const isInactive = disabled || loading;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isInactive, busy: loading }}
      disabled={isInactive}
      onPressIn={() => {
        pressed.value = 1;
      }}
      onPressOut={() => {
        pressed.value = 0;
      }}
      style={[
        styles.base,
        surface[variant],
        {
          height: HEIGHT[size],
          borderRadius: theme.radius.md,
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.xl,
          gap: theme.spacing.sm,
          opacity: isInactive ? 0.55 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        animatedStyle,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? theme.colors.onAccent : theme.colors.accent}
        />
      ) : (
        <>
          {leadingIcon ? <View>{leadingIcon}</View> : null}
          <Text variant={size === 'sm' ? 'subhead' : 'bodyStrong'} color={labelColor[variant]}>
            {label}
          </Text>
          {trailingIcon ? <View>{trailingIcon}</View> : null}
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
