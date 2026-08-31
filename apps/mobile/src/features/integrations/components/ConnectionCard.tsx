import type { CalendarSyncHealth, ProviderAccount } from '@cal/schemas';
import { Badge, Button, Card, Divider, ListRow, Text, useTheme } from '@cal/ui';
import { Alert, View } from 'react-native';

/**
 * One connected account: who it is, whether it is healthy, and what to do next.
 *
 * The status line is the part that earns its place. A connection that has
 * quietly stopped working is the failure mode users cannot diagnose on their
 * own, so an expired grant says "Reconnect" in plain words rather than showing
 * a stale last-synced timestamp and letting them assume it is fine.
 */
export interface ConnectionCardProps {
  account: ProviderAccount;
  health: CalendarSyncHealth[];
  isSyncing: boolean;
  isDisconnecting: boolean;
  onChooseCalendars: () => void;
  onSyncNow: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}

const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google Calendar',
  microsoft: 'Outlook Calendar',
};

export function ConnectionCard({
  account,
  health,
  isSyncing,
  isDisconnecting,
  onChooseCalendars,
  onSyncNow,
  onReconnect,
  onDisconnect,
}: ConnectionCardProps) {
  const theme = useTheme();

  const needsAttention = account.status !== 'active';
  const failing = health.filter((entry) => entry.hasError).length;
  const syncedCalendars = health.filter((entry) => entry.calendarId).length;

  const confirmDisconnect = () =>
    Alert.alert(
      'Disconnect this account?',
      'Its calendars and their events are removed from this app. Nothing changes in ' +
        `${PROVIDER_NAMES[account.provider] ?? 'the provider'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: onDisconnect },
      ],
    );

  return (
    <Card padded={false}>
      <ListRow
        title={PROVIDER_NAMES[account.provider] ?? account.provider}
        subtitle={account.email ?? undefined}
        trailing={<Badge label={statusLabel(account.status)} tone={statusTone(account.status)} />}
      />

      <Divider inset />

      <ListRow
        title="Calendars"
        subtitle={describeSync(syncedCalendars, failing, account.lastSyncAt)}
        meta={syncedCalendars > 0 ? String(syncedCalendars) : undefined}
        showChevron
        onPress={onChooseCalendars}
        disabled={needsAttention}
      />

      <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {needsAttention ? (
          <>
            <Text variant="footnote" color="secondary">
              {reconnectMessage(account.status)}
            </Text>
            <Button label="Reconnect" fullWidth onPress={onReconnect} />
          </>
        ) : (
          <Button
            label="Sync now"
            variant="secondary"
            fullWidth
            loading={isSyncing}
            onPress={onSyncNow}
          />
        )}

        <Button
          label="Disconnect"
          variant="ghost"
          fullWidth
          loading={isDisconnecting}
          onPress={confirmDisconnect}
        />
      </View>
    </Card>
  );
}

function statusLabel(status: ProviderAccount['status']): string {
  if (status === 'active') return 'Connected';
  if (status === 'expired') return 'Reconnect';
  if (status === 'revoked') return 'Revoked';
  return 'Error';
}

function statusTone(status: ProviderAccount['status']): 'success' | 'warning' | 'danger' {
  if (status === 'active') return 'success';
  if (status === 'expired') return 'warning';
  return 'danger';
}

function reconnectMessage(status: ProviderAccount['status']): string {
  if (status === 'revoked') return 'Access was revoked from your provider account.';
  if (status === 'expired') return 'The connection expired. Sign in again to resume syncing.';
  return 'Something went wrong with this connection. Reconnecting usually fixes it.';
}

/**
 * One sentence covering three cases, because they are genuinely different:
 * nothing imported yet, everything healthy, and something failing.
 */
function describeSync(imported: number, failing: number, lastSyncAt: string | null): string {
  if (imported === 0) return 'Choose which calendars to sync';
  if (failing > 0) {
    return failing === 1 ? '1 calendar is not syncing' : `${failing} calendars are not syncing`;
  }
  if (!lastSyncAt) return 'Waiting for the first sync';

  return `Last synced ${relativeTime(lastSyncAt)}`;
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;

  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
