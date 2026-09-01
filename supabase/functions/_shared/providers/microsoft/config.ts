import { EdgeError } from '../../errors/index.ts';

import { requireEnv } from '../config.ts';

/** Microsoft identity platform and Graph endpoints used by the adapter. */
const MICROSOFT_LOGIN_BASE = 'https://login.microsoftonline.com';
export const MICROSOFT_GRAPH_API = 'https://graph.microsoft.com/v1.0';

/**
 * The least-privilege delegated scopes needed by the Outlook adapter.
 * Keep this list exact: it is also the contract recorded in the consent flow.
 */
export const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
] as const;

/** Tenant ids, well-known tenant aliases, and verified tenant domains. */
const TENANT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validate a tenant before interpolating it into an identity-platform URL. */
export function microsoftTenantFor(tenant: string): string {
  if (
    tenant === '.' ||
    tenant === '..' ||
    !TENANT_SEGMENT.test(tenant) ||
    encodeURIComponent(tenant) !== tenant
  ) {
    throw new EdgeError('UNKNOWN', 'Invalid MICROSOFT_OAUTH_TENANT.', 500);
  }
  return tenant;
}

/** The configured tenant, defaulting to the multi-tenant endpoint. */
export function microsoftTenant(): string {
  return microsoftTenantFor(Deno.env.get('MICROSOFT_OAUTH_TENANT') ?? 'common');
}

/** Tenant-specific authority root for Microsoft identity platform v2. */
export function microsoftAuthority(tenant = microsoftTenant()): string {
  return `${MICROSOFT_LOGIN_BASE}/${encodeURIComponent(microsoftTenantFor(tenant))}`;
}

/** Tenant-safe v2 authorization endpoint. */
export function microsoftAuthorizeEndpoint(tenant = microsoftTenant()): string {
  return `${microsoftAuthority(tenant)}/oauth2/v2.0/authorize`;
}

/** Tenant-safe v2 token endpoint. */
export function microsoftTokenEndpoint(tenant = microsoftTenant()): string {
  return `${microsoftAuthority(tenant)}/oauth2/v2.0/token`;
}

export const microsoftClientId = () => requireEnv('MICROSOFT_OAUTH_CLIENT_ID');
export const microsoftClientSecret = () => requireEnv('MICROSOFT_OAUTH_CLIENT_SECRET');

/** Build the default callback URI for a Supabase project URL. */
export function microsoftRedirectUriFor(supabaseUrl: string): string {
  return `${supabaseUrl}/functions/v1/oauth-microsoft-callback`;
}

/** Where Microsoft sends the user back; an explicit override wins. */
export function microsoftRedirectUri(): string {
  return (
    Deno.env.get('MICROSOFT_OAUTH_REDIRECT_URI') ??
      microsoftRedirectUriFor(requireEnv('SUPABASE_URL'))
  );
}
