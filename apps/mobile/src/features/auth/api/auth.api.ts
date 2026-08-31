import { type SignInInput, type SignUpInput, signInSchema, signUpSchema } from '@cal/schemas';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * All authentication network calls. Screens and hooks call these; they never
 * touch the Supabase client directly.
 */

export async function signInWithPassword(input: SignInInput): Promise<void> {
  const { email, password } = signInSchema.parse(input);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
}

export async function signUpWithPassword(input: SignUpInput): Promise<void> {
  const { email, password, fullName } = signUpSchema.parse(input);

  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Read by the handle_new_user trigger to seed the profile row.
    options: { data: { full_name: fullName } },
  });
  if (error) throw toAppError(error);
}

export async function signInWithApple(): Promise<void> {
  // A nonce binds Apple's token to this request. Apple hashes it with SHA-256,
  // so we send the raw value to Supabase and the digest to Apple.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw toAppError(new Error('Apple did not return an identity token'));
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw toAppError(error);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'calendarapp://auth/reset',
  });
  if (error) throw toAppError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error);
}

/**
 * Account deletion runs server-side: it must revoke provider connections and
 * remove the auth user, which the client is not permitted to do.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) throw toAppError(error);
  await supabase.auth.signOut();
}

export const isAppleSignInAvailable = (): Promise<boolean> =>
  AppleAuthentication.isAvailableAsync();
