import { assertEquals, assertThrows } from 'jsr:@std/assert@^1.0.0';

import {
  MICROSOFT_GRAPH_API,
  MICROSOFT_SCOPES,
  microsoftAuthority,
  microsoftAuthorizeEndpoint,
  microsoftRedirectUriFor,
  microsoftTenantFor,
  microsoftTokenEndpoint,
} from './config.ts';

Deno.test('uses the common tenant by default when building authority URLs', () => {
  assertEquals(microsoftAuthority('common'), 'https://login.microsoftonline.com/common');
  assertEquals(
    microsoftAuthorizeEndpoint('common'),
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  );
  assertEquals(
    microsoftTokenEndpoint('common'),
    'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  );
});

Deno.test('accepts a tenant id or domain without changing URL structure', () => {
  const tenant = 'contoso.onmicrosoft.com';
  assertEquals(microsoftTenantFor(tenant), tenant);
  assertEquals(
    microsoftAuthorizeEndpoint(tenant),
    'https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize',
  );
});

Deno.test('rejects tenant values that could escape the authority path', () => {
  assertThrows(() => microsoftTenantFor('common/evil'));
  assertThrows(() => microsoftTenantFor('common?evil'));
  assertThrows(() => microsoftTenantFor('common#evil'));
  assertThrows(() => microsoftTenantFor('common%2Fevil'));
  assertThrows(() => microsoftTenantFor('..'));
});

Deno.test('requests exactly the delegated Outlook scopes', () => {
  assertEquals(
    [...MICROSOFT_SCOPES],
    ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Calendars.ReadWrite'],
  );
});

Deno.test('uses Graph v1 and builds the default callback URI', () => {
  assertEquals(MICROSOFT_GRAPH_API, 'https://graph.microsoft.com/v1.0');
  assertEquals(
    microsoftRedirectUriFor('https://project.supabase.co'),
    'https://project.supabase.co/functions/v1/oauth-microsoft-callback',
  );
});
