import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { EdgeError } from '../errors/index.ts';

const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new EdgeError('UNKNOWN', `Missing ${name}`, 500);
  return value;
};

/**
 * A client scoped to the caller. RLS applies, so this is the safe default for
 * anything acting on the user's behalf.
 */
export function userClient(request: Request): SupabaseClient {
  const authorization = request.headers.get('Authorization');
  if (!authorization) throw new EdgeError('NOT_AUTHENTICATED', 'Sign in required.', 401);

  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
}

/**
 * A service-role client. Bypasses RLS entirely.
 *
 * Only for work the user genuinely cannot do themselves — provider tokens,
 * webhook processing, account deletion. Always scope queries by user id
 * explicitly, because the database will no longer do it for you.
 */
export function adminClient(): SupabaseClient {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve and verify the calling user, or reject. */
export async function requireUser(request: Request): Promise<{ id: string; email?: string }> {
  const client = userClient(request);
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    throw new EdgeError('NOT_AUTHENTICATED', 'Sign in required.', 401);
  }
  return { id: data.user.id, email: data.user.email ?? undefined };
}
