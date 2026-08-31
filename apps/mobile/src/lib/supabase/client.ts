import type { Database } from '@cal/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { env } from '../env';

/**
 * The single Supabase client for the app.
 *
 * It is created with the anon key and always operates as the signed-in user,
 * so Row Level Security is what actually protects the data. The service-role
 * key must never be present in this bundle.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Deep links carry the token as a fragment; we hand it to Supabase
      // explicitly in the auth callback rather than sniffing the URL bar.
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'x-client-platform': Platform.OS },
    },
  },
);

/**
 * Refresh the session only while the app is in the foreground. Left running in
 * the background it burns battery and can race with an expiring token.
 */
export function startAuthAutoRefresh(): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });

  void supabase.auth.startAutoRefresh();
  return () => {
    subscription.remove();
    void supabase.auth.stopAutoRefresh();
  };
}
