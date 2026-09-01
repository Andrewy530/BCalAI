import { EdgeError } from '../errors/index.ts';

import { googleAuth } from './google/auth.ts';
import { googleProvider } from './google/provider.ts';
import type { CalendarProvider, ProviderAuth, ProviderKind, WatchScope } from './types.ts';

/**
 * The only place a provider kind becomes a concrete implementation.
 *
 * Sprint 5 adds Microsoft by registering two more entries here. Nothing else in
 * the sync path should ever branch on `provider`.
 */

const PROVIDERS: Partial<Record<ProviderKind, CalendarProvider>> = {
  google: googleProvider,
};

const AUTHS: Partial<Record<ProviderKind, ProviderAuth>> = {
  google: googleAuth,
};

export function providerFor(kind: string): CalendarProvider {
  const provider = PROVIDERS[kind as ProviderKind];
  if (!provider) {
    throw new EdgeError('VALIDATION_FAILED', `${kind} is not connected yet.`, 400);
  }
  return provider;
}

export function authFor(kind: string): ProviderAuth {
  const auth = AUTHS[kind as ProviderKind];
  if (!auth) {
    throw new EdgeError('VALIDATION_FAILED', `${kind} is not connected yet.`, 400);
  }
  return auth;
}

export function isSupportedProvider(kind: string): kind is ProviderKind {
  return kind in PROVIDERS;
}

/** Provider kinds grouped by their notification registration ownership. */
export function providerKindsForWatchScope(scope: WatchScope): ProviderKind[] {
  return (Object.keys(PROVIDERS) as ProviderKind[]).filter(
    (kind) => PROVIDERS[kind]?.watchScope === scope,
  );
}
