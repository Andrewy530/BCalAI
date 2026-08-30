import { View } from 'react-native';

import { Card, EmptyState, LoadingState, SectionHeader, Text, useTheme } from '@cal/ui';

import { useQuickAddStore } from '../../../store/quick-add.store';
import { useProfile } from '../../settings/hooks/useProfile';

/**
 * Sprint 0 shell.
 *
 * Sprint 3 fills these sections with the merged event/task timeline; the
 * layout, section order, and empty states are deliberately settled now so the
 * screen never has a "temporary" look.
 */
export function TodayScreen() {
  const theme = useTheme();
  const { data: profile, isLoading } = useProfile();
  const openQuickAdd = useQuickAddStore((state) => state.open);

  const timeZone = profile?.timezone ?? 'UTC';
  const today = new Date();
  const heading = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(today);

  if (isLoading) return <LoadingState fullScreen label="Getting your day ready" />;

  const firstName = profile?.fullName?.split(' ')[0];

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="caption" color="tertiary" uppercase>
          {heading}
        </Text>
        <Text variant="display">{firstName ? `Hello, ${firstName}` : 'Today'}</Text>
      </View>

      <Card eyebrow="Up next" title="Nothing scheduled">
        <Text variant="callout" color="secondary">
          Once you add an event or connect a calendar, your next commitment shows up here.
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Due today" count={0} />
        <Card padded={false}>
          <EmptyState
            icon="checkmark-circle-outline"
            title="Nothing due today"
            message="Capture something you need to do and it will appear here."
            actionLabel="Add a task"
            onAction={() => openQuickAdd('task')}
          />
        </Card>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Unscheduled" count={0} />
        <Card padded={false}>
          <EmptyState
            icon="time-outline"
            title="No unscheduled work"
            message="Tasks with an estimate but no time land here, ready to be scheduled."
          />
        </Card>
      </View>
    </View>
  );
}
