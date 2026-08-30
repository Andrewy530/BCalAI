import { requireUser, adminClient } from '../_shared/auth/index.ts';
import { EdgeError, withErrorHandling } from '../_shared/errors/index.ts';
import { jsonResponse, preflight } from '../_shared/http/cors.ts';
import { releaseProviderGrant } from '../_shared/providers/disconnect.ts';

/**
 * Account deletion.
 *
 * Required by App Store review, and the only correct place for it: the client
 * cannot delete an auth user, and provider connections must be revoked before
 * the rows disappear. Everything else is removed by ON DELETE CASCADE from
 * auth.users.
 */
const handler = withErrorHandling(async (request) => {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') {
    throw new EdgeError('METHOD_NOT_ALLOWED', 'Use POST.', 405);
  }

  const user = await requireUser(request);
  const admin = adminClient();

  // 1. Revoke every connected provider first. If this fails we stop, rather
  //    than orphaning a live OAuth grant with no record of it on our side.
  const { data: accounts, error: accountsError } = await admin
    .from('provider_accounts')
    .select('id, provider')
    .eq('user_id', user.id);

  if (accountsError) throw new EdgeError('UNKNOWN', 'Could not read connections.', 500);

  for (const account of accounts ?? []) {
    // Stops change channels, revokes the grant, and removes the Vault secret.
    // Best-effort inside: an unreachable provider must not trap a user in an
    // account they have asked to delete.
    await releaseProviderGrant(admin, account.id);
    console.log(JSON.stringify({ event: 'provider_released', provider: account.provider }));
  }

  // 2. Delete the auth user. Cascades remove profile, calendars, events,
  //    tasks, connections, and subscriptions.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) throw new EdgeError('UNKNOWN', 'Could not delete the account.', 500);

  console.log(JSON.stringify({ event: 'account_deleted', userId: user.id }));
  return jsonResponse({ deleted: true });
});

Deno.serve(handler);
