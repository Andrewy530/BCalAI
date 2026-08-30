import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { startAuthAutoRefresh, supabase } from '../../../lib/supabase/client';

export interface SessionState {
  session: Session | null;
  /** True until the persisted session has been read from storage. */
  isLoading: boolean;
}

/**
 * The app's single source of truth for "is someone signed in".
 *
 * Mounted once by the root layout; everything else reads it through
 * `useAuth()` so there is only ever one auth subscription.
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

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    const stopAutoRefresh = startAuthAutoRefresh();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      stopAutoRefresh();
    };
  }, []);

  return { session, isLoading };
}
