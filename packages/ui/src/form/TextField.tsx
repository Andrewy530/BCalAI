import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, type TextInputProps, View, type ViewStyle } from 'react-native';

import { Text } from '../text/Text';
import { useTheme } from '../theme/ThemeProvider';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Validation message. Its presence puts the field in the error state. */
  error?: string;
  /** Guidance shown when there is no error. */
  hint?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: ViewStyle;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, leading, trailing, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.accent
      : theme.colors.border;

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? (
        <Text variant="subhead" color="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 48,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.md,
          borderWidth: focused || error ? 1 : StyleSheet.hairlineWidth,
          borderColor,
          backgroundColor: theme.colors.surface,
        }}
      >
        {leading}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.textTertiary}
          selectionColor={theme.colors.accent}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            theme.typography.body,
            { flex: 1, color: theme.colors.textPrimary, paddingVertical: theme.spacing.md },
          ]}
          {...rest}
        />
        {trailing}
      </View>

      {error ? (
        <Text variant="footnote" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
