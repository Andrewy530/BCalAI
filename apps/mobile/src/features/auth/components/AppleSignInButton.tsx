import { useTheme } from '@cal/ui';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

export interface AppleSignInButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Apple requires its own button styling, so this is the one place the design
 * system is deliberately bypassed.
 */
export function AppleSignInButton({ onPress, disabled }: AppleSignInButtonProps) {
  const theme = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  if (!available) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={
        theme.scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={theme.radius.md}
      style={[styles.button, disabled && styles.disabled]}
      onPress={() => {
        if (!disabled) onPress();
      }}
    />
  );
}

const styles = StyleSheet.create({
  button: { height: 46, width: '100%' },
  disabled: { opacity: 0.5 },
});
