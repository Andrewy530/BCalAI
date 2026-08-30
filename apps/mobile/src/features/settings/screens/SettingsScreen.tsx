import { Alert, View } from 'react-native';

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

import { useAuth, useAuthActions } from '../../auth';
import { NotificationSettingsCard } from '../../notifications';
import { useProfile } from '../hooks/useProfile';

/**
 * Identity, planning preferences, reminders, and the destructive actions.
 * Rows without a destination are marked so nobody has to guess whether they
 * are broken or simply unbuilt.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const { email } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { signOut } = useAuthActions();

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
          onPress={() => undefined}
        />
        <Divider inset />
        <ListRow
          title="Week starts on"
          meta={profile?.weekStartsOn === 1 ? 'Monday' : 'Sunday'}
          showChevron
          onPress={() => undefined}
        />
        <Divider inset />
        <ListRow
          title="Clock"
          meta={profile?.hourCycle === 'h23' ? '24-hour' : '12-hour'}
          showChevron
          onPress={() => undefined}
        />
        <Divider inset />
        <ListRow
          title="Working hours"
          subtitle="Used when finding time for flexible work"
          meta={`${profile?.workingHours.length ?? 0} days`}
          showChevron
          onPress={() => undefined}
        />
        <Divider inset />
        <ListRow
          title="Default task duration"
          meta={`${profile?.defaultTaskMinutes ?? 30} min`}
          showChevron
          onPress={() => undefined}
        />
      </Card>

      <NotificationSettingsCard />

      <Card eyebrow="Connections" padded={false}>
        <ListRow
          title="Google Calendar"
          subtitle="Two-way sync for your Google calendars"
          trailing={<Badge label="Sprint 4" />}
          disabled
        />
        <Divider inset />
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
    </View>
  );
}
