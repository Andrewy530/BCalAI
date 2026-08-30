import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useSessionState } from './useSession';

interface AuthContextValue {
  userId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, isLoading } = useSessionState();

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: session?.user.id ?? null,
      email: session?.user.email ?? null,
      isAuthenticated: !!session,
      isLoading,
    }),
    [session, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** For code paths that genuinely cannot run signed-out. */
export function useRequiredUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('Expected an authenticated user');
  return userId;
}
