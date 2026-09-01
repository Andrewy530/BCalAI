import type { WatchRegistration } from './types.ts';

/**
 * The persisted pieces of a provider watch registration.
 *
 * Google identifies a channel with `resourceId`; Graph identifies one with
 * `subscriptionId`. Keeping both nullable here lets the shared teardown path
 * reconstruct either provider's registration without knowing which provider
 * created it.
 */
export interface StoredWatchState {
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_subscription_id: string | null;
  webhook_token: string | null;
  webhook_expires_at: string | null;
}

/** Renew provider watches with the same safety margin used by the cron. */
export const WATCH_RENEWAL_MARGIN_MS = 2 * 24 * 60 * 60 * 1000;

export function watchRenewalThreshold(now = new Date()): Date {
  return new Date(now.getTime() + WATCH_RENEWAL_MARGIN_MS);
}

/**
 * Reconstruct a provider registration only when it has enough identity to be
 * stopped. The fallback is supplied by callers so this helper stays pure and
 * deterministic in unit tests.
 */
export function watchRegistrationFromState(
  state: StoredWatchState,
  fallbackExpiresAt: string,
): WatchRegistration | null {
  if (!state.webhook_channel_id || (!state.webhook_resource_id && !state.webhook_subscription_id)) {
    return null;
  }

  return {
    channelId: state.webhook_channel_id,
    resourceId: state.webhook_resource_id,
    subscriptionId: state.webhook_subscription_id,
    token: state.webhook_token ?? '',
    expiresAt: state.webhook_expires_at ?? fallbackExpiresAt,
  };
}

/**
 * An account-scoped registration can be reused until its provider expiry is
 * inside the renewal safety margin. A missing token is not healthy: it would
 * leave a Graph clientState-less watch that cannot be authenticated by the
 * webhook.
 */
export function watchRegistrationIsHealthy(
  registration: WatchRegistration | null,
  now = new Date(),
): boolean {
  if (!registration || !registration.token) return false;

  const expiresAt = Date.parse(registration.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > watchRenewalThreshold(now).getTime();
}
