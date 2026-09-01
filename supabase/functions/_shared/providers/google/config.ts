import { requireEnv } from '../config.ts';

export { appReturnUrl, requireEnv } from '../config.ts';

/**
 * Google client configuration.
 *
 * The OAuth client is registered as a *web* application even though the caller
 * is a mobile app. The consent redirect lands on our callback Edge Function,
 * which then bounces back into the app via the custom scheme. That indirection
 * is deliberate: it keeps the client secret server-side and is what makes
 * Google issue a refresh token we can store in Vault, which a public native
 * client could not safely hold.
 */

export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
export const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/**
 * Granular scopes rather than the blanket `auth/calendar`.
 *
 * `calendar.events` covers both reading and writing events, including the
 * `watch` channel; `calendarlist.readonly` is only needed for the picker.
 * Asking for less makes the consent screen easier to accept and reduces what a
 * compromised token could do.
 */
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

export const googleClientId = () => requireEnv('GOOGLE_OAUTH_CLIENT_ID');
export const googleClientSecret = () => requireEnv('GOOGLE_OAUTH_CLIENT_SECRET');

/** Where Google sends the user back. Must match the console entry exactly. */
export const googleRedirectUri = (): string =>
  Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI') ??
  `${requireEnv('SUPABASE_URL')}/functions/v1/oauth-google-callback`;
