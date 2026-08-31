import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Text,
  useTheme,
} from '@cal/ui';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { CalendarPickerSheet } from '../components/CalendarPickerSheet';
import { ConnectionCard } from '../components/ConnectionCard';
import { CONNECT_MESSAGES, useConnectProvider } from '../hooks/useConnectProvider';
import {
  useConnections,
  useDisconnectAccount,
  useSyncHealth,
  useSyncNow,
} from '../hooks/useIntegrations';

/**
 * Connected calendars.
 *
 * Composition and interaction only — every server call goes through a hook, and
 * every hook through the API module, so this screen never learns that a
 * connection is four Edge Functions and a job queue.
 */
export function IntegrationsScreen() {
  const theme = useTheme();

  const connections = useConnections();
  // Health is polled while something is still settling — a calendar imported a
  // moment ago is syncing in the background with nothing for the client to await.
  const health = useSyncHealth({ poll: true });

  const connect = useConnectProvider();
  const disconnect = useDisconnectAccount();
  const syncNow = useSyncNow();

  const [pickerAccountId, setPickerAccountId] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const onConnect = () => {
    connect.mutate(undefined, {
      onSuccess: (status) => {
        if (status === 'connected') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return;
        }
        // Cancelling is a normal outcome and does not deserve an alert.
        if (status === 'cancelled') return;
        Alert.alert('Not connected', CONNECT_MESSAGES[status]);
      },
      onError: () => Alert.alert('Not connected', CONNECT_MESSAGES.failed),
    });
  };

  const onDisconnect = (accountId: string) => {
    setBusyAccountId(accountId);
    disconnect.mutate(accountId, {
      onSettled: () => setBusyAccountId(null),
      onError: () => Alert.alert('Could not disconnect', 'Check your connection and try again.'),
    });
  };

  const onSyncNow = (accountId: string) => {
    setBusyAccountId(accountId);
    void Haptics.selectionAsync();
    syncNow.mutate(undefined, { onSettled: () => setBusyAccountId(null) });
  };

  if (connections.isLoading) return <LoadingState fullScreen />;

  if (connections.isError) {
    return (
      <ErrorState
        title="Could not load your connections"
        onRetry={() => void connections.refetch()}
      />
    );
  }

  const accounts = connections.data ?? [];
  const healthFor = (accountId: string) =>
    (health.data ?? []).filter((entry) => entry.providerAccountId === accountId);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="display">Connections</Text>
        <Text variant="footnote" color="secondary">
          Connected calendars sync both ways. Events you create on them are written to the provider
          first.
        </Text>
      </View>

      {accounts.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No calendars connected"
          message="Connect Google to see your existing calendar alongside your tasks."
          actionLabel={connect.isPending ? 'Connecting…' : 'Connect Google Calendar'}
          onAction={connect.isPending ? undefined : onConnect}
        />
      ) : (
        accounts.map((account) => (
          <ConnectionCard
            key={account.id}
            account={account}
            health={healthFor(account.id)}
            isSyncing={syncNow.isPending && busyAccountId === account.id}
            isDisconnecting={disconnect.isPending && busyAccountId === account.id}
            onChooseCalendars={() => setPickerAccountId(account.id)}
            onSyncNow={() => onSyncNow(account.id)}
            onReconnect={onConnect}
            onDisconnect={() => onDisconnect(account.id)}
          />
        ))
      )}

      {accounts.length > 0 && !accounts.some((account) => account.provider === 'google') ? (
        <Button
          label="Connect Google Calendar"
          variant="secondary"
          fullWidth
          loading={connect.isPending}
          onPress={onConnect}
        />
      ) : null}

      <Card eyebrow="Coming soon" padded={false}>
        <ListRow
          title="Outlook Calendar"
          subtitle="Two-way sync via Microsoft Graph"
          trailing={<Badge label="Sprint 5" />}
          disabled
        />
        <Divider inset />
        <ListRow
          title="Find Time with AI"
          subtitle="Schedule flexible work around your commitments"
          trailing={<Badge label="Pro" tone="accent" />}
          disabled
        />
      </Card>

      <CalendarPickerSheet
        visible={pickerAccountId !== null}
        providerAccountId={pickerAccountId}
        onClose={() => setPickerAccountId(null)}
      />
    </View>
  );
}
