import type { ProviderAccount } from '@cal/schemas';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Divider,
  ListRow,
  LoadingState,
  Text,
  useTheme,
} from '@cal/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useAuth, useAuthActions } from '../../auth';
import { useConnections } from '../../integrations/hooks/useIntegrations';
import { NotificationSettingsCard } from '../../notifications';
import {
  PlanningPreferencesSheet,
  type PlanningPreference,
} from '../components/PlanningPreferencesSheet';
import { useProfile } from '../hooks/useProfile';

/**
 * Identity, planning preferences, reminders, connections, and the destructive
 * actions. Anything still unbuilt is badged rather than hidden, so nobody has
 * to guess whether it is unavailable or simply not written yet.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const { email } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { data: connections = [] } = useConnections();
  const { signOut } = useAuthActions();
  const [preference, setPreference] = useState<PlanningPreference | null>(null);

  if (isLoading) return <LoadingState fullScreen />;

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut.mutate() },
    ]);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Text variant="display">Settings</Text>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
          <Avatar name={profile?.fullName} imageUrl={profile?.avatarUrl} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{profile?.fullName ?? 'Your account'}</Text>
            <Text variant="footnote" color="secondary">
              {email}
            </Text>
          </View>
        </View>
      </Card>

      <Card eyebrow="Planning" padded={false}>
        <ListRow
          title="Time zone"
          meta={profile?.timezone ?? 'UTC'}
          showChevron
          onPress={() => setPreference('timezone')}
        />
        <Divider inset />
        <ListRow
          title="Week starts on"
          meta={profile?.weekStartsOn === 1 ? 'Monday' : 'Sunday'}
          showChevron
          onPress={() => setPreference('weekStartsOn')}
        />
        <Divider inset />
        <ListRow
          title="Clock"
          meta={profile?.hourCycle === 'h23' ? '24-hour' : '12-hour'}
          showChevron
          onPress={() => setPreference('hourCycle')}
        />
        <Divider inset />
        <ListRow
          title="Working hours"
          subtitle="Used when finding time for flexible work"
          meta={`${profile?.workingHours.length ?? 0} days`}
          showChevron
          onPress={() => setPreference('workingHours')}
        />
        <Divider inset />
        <ListRow
          title="Default task duration"
          meta={`${profile?.defaultTaskMinutes ?? 30} min`}
          showChevron
          onPress={() => setPreference('defaultTaskMinutes')}
        />
      </Card>

      <NotificationSettingsCard />

      <Card eyebrow="Connections" padded={false}>
        <ListRow
          title="Calendar accounts"
          subtitle={connectionSummary(connections)}
          meta={connections.length > 0 ? String(connections.length) : undefined}
          showChevron
          onPress={() => router.push('/settings/integrations')}
        />
        <Divider inset />
        <ListRow
          title="Find Time with AI"
          subtitle="Schedule flexible work around your commitments"
          trailing={<Badge label="Pro" tone="accent" />}
          disabled
        />
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <Button
          label="Sign out"
          variant="secondary"
          fullWidth
          loading={signOut.isPending}
          onPress={confirmSignOut}
        />
        <Text variant="footnote" color="tertiary" align="center">
          Deleting your account removes your data and revokes every calendar connection.
        </Text>
      </View>

      <PlanningPreferencesSheet
        visible={preference !== null}
        preference={preference}
        profile={profile}
        onClose={() => setPreference(null)}
      />
    </View>
  );
}

/**
 * The row's subtitle carries the state that matters at a glance: a connection
 * that needs re-authorising is the one thing a user cannot discover for
 * themselves, so it outranks the count.
 */
function connectionSummary(connections: ProviderAccount[]): string {
  if (connections.length === 0) return 'Sync Google Calendar';

  const attention = connections.filter((account) => account.status !== 'active').length;
  if (attention > 0) {
    return attention === 1 ? '1 account needs reconnecting' : `${attention} accounts need reconnecting`;
  }

  return connections.length === 1 ? '1 account connected' : `${connections.length} accounts connected`;
}
