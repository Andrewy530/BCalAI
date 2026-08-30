import type { ProviderKind, SyncWindow } from '../providers/types.ts';

/**
 * Sync-wide policy that is not any one provider's business: how much calendar
 * we import, and where each provider's change notifications are delivered.
 *
 * These live here rather than in `providers/google/config.ts` so that the
 * engine never imports a provider module — which is what keeps "nothing above
 * the adapter knows which provider it is talking to" true rather than aspirational.
 */

/**
 * A year back is enough for "what did I do last quarter" without dragging a
 * decade of dead meetings through the queue on first connect. Two years forward
 * covers annual commitments already on the books.
 */
export const INITIAL_SYNC_MONTHS_BACK = 12;
export const INITIAL_SYNC_MONTHS_FORWARD = 24;

export function initialSyncWindow(now = new Date()): SyncWindow {
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - INITIAL_SYNC_MONTHS_BACK);

  const to = new Date(now);
  to.setUTCMonth(to.getUTCMonth() + INITIAL_SYNC_MONTHS_FORWARD);

  return { from: from.toISOString(), to: to.toISOString() };
}

/** Where a provider should post change notifications. Must be HTTPS. */
export function webhookUrlFor(provider: ProviderKind): string {
  const configured = Deno.env.get(`${provider.toUpperCase()}_WEBHOOK_URL`);
  if (configured) return configured;

  const base = Deno.env.get('SUPABASE_URL');
  if (!base) throw new Error('Missing SUPABASE_URL');

  return `${base}/functions/v1/webhook-${provider}`;
}
