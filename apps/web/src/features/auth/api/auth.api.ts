import { type SignInInput, signInSchema } from '@cal/schemas';

import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';

/**
 * Authentication network calls for the web client.
 * UI components and pages call these functions; they never touch the Supabase client directly.
 */

export async function signInWithPassword(input: SignInInput): Promise<void> {
  const { email, password } = signInSchema.parse(input);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error);
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error);
}
