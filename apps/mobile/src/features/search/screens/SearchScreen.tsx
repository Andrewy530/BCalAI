import { describeTaskDue, formatTimeOfDay } from '@cal/domain';
import {
  Card,
  Divider,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  SectionHeader,
  TextField,
  useTheme,
} from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useDeferredValue, useState } from 'react';
import { View } from 'react-native';

import { useEventEditorStore } from '../../../store/event-editor.store';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useProfile } from '../../settings/hooks/useProfile';
import { useSearch } from '../hooks/useSearch';

/** Search internal events and tasks by the words users actually remember. */
export function SearchScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const search = useSearch(deferredQuery);
  const { data: profile } = useProfile();
  const timeZone = profile?.timezone ?? 'UTC';
  const hourCycle = profile?.hourCycle ?? 'h23';
  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openTask = useTaskEditorStore((state) => state.openTask);
  const now = new Date();
  const normalizedQuery = query.trim();

  const content = () => {
    if (normalizedQuery.length === 0) {
      return (
        <EmptyState
          icon="search-outline"
          title="Search everything"
          message="Find any event or task by title, note, or location."
        />
      );
    }

    if (normalizedQuery.length < 2) {
      return (
        <EmptyState
          icon="search-outline"
          title="Keep typing"
          message="Search starts after two characters."
        />
      );
    }

    if (search.isLoading || search.isFetching) return <LoadingState label="Searching" />;

    if (search.isError) {
      return (
        <ErrorState
          title="Search could not load"
          message="Check your connection and try again."
          onRetry={() => void search.refetch()}
        />
      );
    }

    const events = search.data?.events ?? [];
    const tasks = search.data?.tasks ?? [];
    const calendars = new Map(
      (search.data?.calendars ?? []).map((calendar) => [calendar.id, calendar]),
    );

    if (events.length === 0 && tasks.length === 0) {
      return (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message={`Nothing matched “${normalizedQuery}”. Try a title, note, or location.`}
        />
      );
    }

    return (
      <View style={{ gap: theme.spacing.xl }}>
        {events.length > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Events" count={events.length} />
            <Card padded={false}>
              {events.map((event, index) => (
                <Fragment key={event.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <ListRow
                    title={event.title}
                    subtitle={
                      [calendars.get(event.calendarId)?.name, event.location]
                        .filter(Boolean)
                        .join(' · ') || 'Calendar event'
                    }
                    meta={
                      event.allDay
                        ? 'All day'
                        : formatTimeOfDay(new Date(event.startAt), timeZone, hourCycle)
                    }
                    leading={
                      <Ionicons name="calendar-outline" size={19} color={theme.colors.accent} />
                    }
                    accentColor={calendars.get(event.calendarId)?.color}
                    onPress={() => openEvent(event.id)}
                  />
                </Fragment>
              ))}
            </Card>
          </View>
        ) : null}

        {tasks.length > 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Tasks" count={tasks.length} />
            <Card padded={false}>
              {tasks.map((task, index) => {
                const due =
                  task.status === 'completed'
                    ? 'Completed'
                    : describeTaskDue(task, { now, timeZone, hourCycle }).text || 'No due date';

                return (
                  <Fragment key={task.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <ListRow
                      title={task.title}
                      subtitle={task.description ?? 'Task'}
                      meta={due}
                      leading={
                        <Ionicons name="checkbox-outline" size={19} color={theme.colors.accent} />
                      }
                      onPress={() => openTask(task.id)}
                    />
                  </Fragment>
                );
              })}
            </Card>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search events and tasks"
        autoCorrect={false}
        returnKeyType="search"
        leading={<Ionicons name="search" size={18} color={theme.colors.textTertiary} />}
      />

      <View>{content()}</View>
    </View>
  );
}
