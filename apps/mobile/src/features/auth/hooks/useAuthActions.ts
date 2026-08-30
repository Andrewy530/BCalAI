import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';

import type { SignInInput, SignUpInput } from '@cal/schemas';

import { logEvent } from '../../../lib/logger';
import {
  sendPasswordReset,
  signInWithApple,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from '../api/auth.api';

/**
 * Auth mutations with their side effects (haptics, analytics, cache reset) in
 * one place, so every entry point behaves identically.
 */
export function useAuthActions() {
  const queryClient = useQueryClient();

  const onSuccess = (event: string) => {
    logEvent(event);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/today');
  };

  const signIn = useMutation({
    mutationFn: (input: SignInInput) => signInWithPassword(input),
    onSuccess: () => onSuccess('auth_sign_in'),
  });

  const signUp = useMutation({
    mutationFn: (input: SignUpInput) => signUpWithPassword(input),
    onSuccess: () => onSuccess('auth_sign_up'),
  });

  const apple = useMutation({
    mutationFn: () => signInWithApple(),
    onSuccess: () => onSuccess('auth_sign_in_apple'),
  });

  const resetPassword = useMutation({
    mutationFn: (email: string) => sendPasswordReset(email),
    onSuccess: () => logEvent('auth_reset_requested'),
  });

  const signOutMutation = useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      // Drop every cached row so the next account never sees the last one's data.
      queryClient.clear();
      logEvent('auth_sign_out');
      router.replace('/(auth)/sign-in');
    },
  });

  return { signIn, signUp, apple, resetPassword, signOut: signOutMutation };
}
