import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Tints the unchecked ring — used for task priority. */
  color?: string;
  size?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: ViewStyle;
  testID?: string;
}

const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons);

/**
 * Completing a task is the most-repeated interaction in the app, so it gets a
 * deliberate two-part animation: the ring fills, and the tick scales in just
 * behind it. It reads as a single confident motion rather than a state swap.
 */
export function Checkbox({
  checked,
  onChange,
  color,
  size = 24,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: CheckboxProps) {
  const theme = useTheme();
  const tint = color ?? theme.colors.accent;

  const progress = useDerivedValue(
    () => withTiming(checked ? 1 : 0, { duration: theme.motion.duration.fast }),
    [checked],
  );

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: progress.value > 0.5 ? tint : 'transparent',
    borderColor: progress.value > 0.5 ? tint : theme.colors.borderStrong,
  }));

  const tickStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: withSpring(checked ? 1 : 0.4, theme.motion.spring) }],
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      // Keep the visual box small but the target comfortably tappable.
      hitSlop={Math.max(0, (theme.hitSlopSize - size) / 2)}
      style={style}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.5 : 1,
          },
          boxStyle,
        ]}
      >
        <AnimatedIonicons
          name="checkmark"
          size={size * 0.62}
          color={theme.colors.onAccent}
          style={tickStyle}
        />
      </Animated.View>
    </Pressable>
  );
}

/** Hairline used to strike through a completed task's title. */
export const strikeThroughStyle = StyleSheet.create({
  text: { textDecorationLine: 'line-through' },
}).text;
