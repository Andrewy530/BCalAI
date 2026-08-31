import { ThemeProvider } from '@cal/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppSheets } from '../src/components/app-shell/AppSheets';
import { TaskEditorHost } from '../src/components/app-shell/TaskEditorHost';
import { AuthProvider, useAuth } from '../src/features/auth';
import { ReminderSync } from '../src/features/notifications';
import { ErrorBoundary } from '../src/lib/errors/ErrorBoundary';
import { queryClient } from '../src/lib/query/query-client';

void SplashScreen.preventAutoHideAsync();

/**
 * Redirects between the authenticated and unauthenticated route groups.
 *
 * Kept as its own component so it sits *inside* AuthProvider, and so the
 * navigation rule lives in one place rather than in every screen.
 */
function AuthGate() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;

    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) router.replace('/(auth)/sign-in');
    else if (isAuthenticated && inAuthGroup) router.replace('/(tabs)/today');
  }, [isAuthenticated, isLoading, segments]);

  return null;
}

function AuthenticatedOverlays() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <>
      <AppSheets />
      <TaskEditorHost />
      <ReminderSync />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ErrorBoundary>
                <AuthGate />
                <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="settings/integrations"
                    options={{ headerShown: true, title: 'Connections', animation: 'default' }}
                  />
                </Stack>
                <AuthenticatedOverlays />
              </ErrorBoundary>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
