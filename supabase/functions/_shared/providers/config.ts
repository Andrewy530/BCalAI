import { EdgeError } from '../errors/index.ts';

/** Read a required server-side provider setting without exposing its value. */
export const requireEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new EdgeError('UNKNOWN', `Missing ${name}`, 500);
  return value;
};

/** Where an OAuth callback bounces the browser back into the app. */
export const appReturnUrl = (): string =>
  Deno.env.get('APP_OAUTH_RETURN_URL') ?? 'calendarapp://settings/integrations';
