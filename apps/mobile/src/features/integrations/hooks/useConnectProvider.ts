import {
  type ConnectResult,
  type ProviderKind,
  connectResultSchema,
  providerKindSchema,
} from '@cal/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { queryKeys } from '../../../lib/query/query-client';
import { startProviderConnect } from '../api/integrations.api';

/**
 * The OAuth round trip, from the app's side.
 *
 * `openAuthSessionAsync` is what makes this safe *and* usable: consent happens
 * in a system browser the app cannot read, and the app is still woken by the
 * redirect back to our scheme. An in-app WebView would be able to observe the
 * provider account's password, which is exactly why providers reject it.
 *
 * The app never sees the authorisation code. It goes from the provider straight
 * to our callback function, which is the only party holding the client secret.
 */

/** Must match the URL the callback function redirects to. */
const RETURN_URL = 'calendarapp://settings/integrations';

export function useConnectProvider() {
  const queryClient = useQueryClient();

  return useMutation<ConnectResult, unknown, ProviderKind>({
    mutationFn: async (provider) => {
      const authorizationUrl = await startProviderConnect(provider);

      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, RETURN_URL, {
        // Nothing should be reused between connect attempts, and a stale
        // session is a common source of "it connected the wrong account".
        preferEphemeralSession: true,
      });

      // Dismissing the sheet is a normal outcome, not a failure to report.
      if (result.type !== 'success') return 'cancelled';

      return readStatus(result.url, provider);
    },

    onSuccess: (status) => {
      if (status !== 'connected') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.health() });
    },
  });
}

/**
 * The callback puts only a fixed reason code in the redirect — never an email,
 * an account id, or a provider message — so an unrecognised value is treated as
 * a failure rather than shown to the user.
 */
function readStatus(url: string, expectedProvider: ProviderKind): ConnectResult {
  try {
    const params = new URL(url).searchParams;
    const provider = providerKindSchema.safeParse(params.get('provider'));
    if (!provider.success || provider.data !== expectedProvider) return 'failed';

    const status = params.get('status');
    const parsed = connectResultSchema.safeParse(status);
    return parsed.success ? parsed.data : 'failed';
  } catch {
    return 'failed';
  }
}

/** Human-readable outcomes for everything except the happy path. */
export const CONNECT_MESSAGES: Record<Exclude<ConnectResult, 'connected'>, string> = {
  cancelled: 'Connection cancelled.',
  expired: 'That connection attempt timed out. Try again.',
  failed: 'We could not finish connecting. Try again.',
  invalid_request: 'The provider sent back something we did not expect.',
};
