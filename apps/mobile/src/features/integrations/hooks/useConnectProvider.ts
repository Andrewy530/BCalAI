import { type ConnectResult, connectResultSchema } from '@cal/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { queryKeys } from '../../../lib/query/query-client';
import { startGoogleConnect } from '../api/integrations.api';

/**
 * The OAuth round trip, from the app's side.
 *
 * `openAuthSessionAsync` is what makes this safe *and* usable: consent happens
 * in a system browser the app cannot read, and the app is still woken by the
 * redirect back to our scheme. An in-app WebView would be able to observe the
 * user's Google password, which is exactly why Google rejects it.
 *
 * The app never sees the authorisation code. It goes from Google straight to
 * our callback function, which is the only party holding the client secret.
 */

/** Must match the URL the callback function redirects to. */
const RETURN_URL = 'calendarapp://settings/integrations';

export function useConnectProvider() {
  const queryClient = useQueryClient();

  return useMutation<ConnectResult, unknown, void>({
    mutationFn: async () => {
      const authorizationUrl = await startGoogleConnect();

      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, RETURN_URL, {
        // Nothing should be reused between connect attempts, and a stale Google
        // session is a common source of "it connected the wrong account".
        preferEphemeralSession: true,
      });

      // Dismissing the sheet is a normal outcome, not a failure to report.
      if (result.type !== 'success') return 'cancelled';

      return readStatus(result.url);
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
function readStatus(url: string): ConnectResult {
  try {
    const status = new URL(url).searchParams.get('status');
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
  invalid_request: 'Google sent back something we did not expect.',
};
