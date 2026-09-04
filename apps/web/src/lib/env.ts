import { z } from 'zod';

/**
 * Validate browser environment configuration at startup.
 * Only VITE_* variables are exposed to the browser client.
 * Server secrets, service-role keys, and OAuth client secrets MUST NEVER be loaded here.
 */
const envSchema = z.object({
  supabaseUrl: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(20, 'VITE_SUPABASE_ANON_KEY is missing or invalid'),
  appEnv: z.enum(['development', 'preview', 'production']).default('development'),
});

const parsed = envSchema.safeParse({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  appEnv: import.meta.env.VITE_APP_ENV,
});

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.message}`).join('\n');
  throw new Error(
    `Missing or invalid web environment configuration:\n${issues}\n\n` +
      'Copy apps/web/.env.example to apps/web/.env.local and fill in the values.',
  );
}

export const env = parsed.data;
export const isDevelopment = env.appEnv === 'development';
