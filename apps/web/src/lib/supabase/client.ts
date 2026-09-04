import type { Database } from '@cal/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '../env';

/**
 * The single Supabase client for the web application.
 *
 * Configured with the anon key and operates with Row Level Security.
 * Uses standard browser localStorage for session persistence and auto-refresh.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        'x-client-platform': 'web',
      },
    },
  },
);
