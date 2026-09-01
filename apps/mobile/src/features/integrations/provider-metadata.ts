import type { ProviderKind } from '@cal/schemas';

/**
 * The mobile-facing identity and availability of each calendar provider.
 *
 * Keep the function name here rather than deriving it from the provider kind:
 * provider kinds are data, while Edge Function names are an implementation
 * boundary. The explicit map also makes adding a provider an exhaustive edit.
 */
export interface ProviderMetadata {
  readonly kind: ProviderKind;
  readonly name: string;
  readonly connectLabel: string;
  readonly oauthStartFunction: string;
  readonly available: boolean;
  readonly unavailableSubtitle?: string;
}

export const PROVIDER_METADATA: Record<ProviderKind, ProviderMetadata> = {
  google: {
    kind: 'google',
    name: 'Google Calendar',
    connectLabel: 'Connect Google Calendar',
    oauthStartFunction: 'oauth-google-start',
    available: true,
  },
  microsoft: {
    kind: 'microsoft',
    name: 'Outlook Calendar',
    connectLabel: 'Connect Outlook Calendar',
    oauthStartFunction: 'oauth-microsoft-start',
    available: true,
  },
};

/** Stable display order for provider choices on the integrations screen. */
export const PROVIDER_OPTIONS = [PROVIDER_METADATA.google, PROVIDER_METADATA.microsoft] as const;

export function providerMetadata(kind: ProviderKind): ProviderMetadata {
  return PROVIDER_METADATA[kind];
}
