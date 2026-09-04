import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabase/client';

export interface SessionState {
  session: Session | null;
  /** True while the session is initially restoring from browser storage */
  isLoading: boolean;
}

/**
 * Single source of truth for browser authentication session state.
 * Subscribes to Supabase auth state changes and restores persisted sessions.
 */
export function useSessionState(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, isLoading };
}
