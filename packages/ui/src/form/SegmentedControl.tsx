import { Pressable, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Tints the selected segment, e.g. a priority colour. */
  color?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
  style?: ViewStyle;
}

/**
 * A compact one-of-N picker for short, mutually exclusive choices such as
 * priority. Prefer `Chip` rows when the options are many or multi-select.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View style={[{ gap: theme.spacing.xs }, style]}>
      {label ? (
        <Text variant="subhead" color="secondary">
          {label}
        </Text>
      ) : null}

      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          padding: 3,
          gap: 3,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surface,
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          const tint = option.color ?? theme.colors.accent;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 36,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                backgroundColor: selected ? theme.colors.surfaceElevated : 'transparent',
                borderWidth: selected ? 1 : 0,
                borderColor: selected ? tint : 'transparent',
              }}
            >
              <Text
                variant="subhead"
                numberOfLines={1}
                style={{ color: selected ? tint : theme.colors.textSecondary }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
