import { z } from 'zod';

/**
 * Fail fast and loudly on a misconfigured build rather than at the first
 * network call. Only EXPO_PUBLIC_* values may appear here — anything secret
 * belongs in an Edge Function, never in the bundle.
 */
const envSchema = z.object({
  supabaseUrl: z.string().url('EXPO_PUBLIC_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(20, 'EXPO_PUBLIC_SUPABASE_ANON_KEY is missing'),
  appEnv: z.enum(['development', 'preview', 'production']).default('development'),
  sentryDsn: z.string().optional(),
});

const parsed = envSchema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join('\n');
  throw new Error(
    `Missing or invalid environment configuration:\n${issues}\n\n` +
      'Copy .env.example to .env at the repo root and fill it in (see README.md).',
  );
}

export const env = parsed.data;
export const isDevelopment = env.appEnv === 'development';
