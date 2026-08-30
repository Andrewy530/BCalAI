import { formatDuration, formatTimeOfDay } from '@cal/domain';
import {
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SectionHeader,
  Text,
  useTheme,
} from '@cal/ui';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useEventEditorStore } from '../../../store/event-editor.store';
import { useQuickAddStore } from '../../../store/quick-add.store';
import { useTaskEditorStore } from '../../../store/task-editor.store';
import { TaskGroup } from '../../tasks/components/TaskGroup';
import { useTaskActions } from '../../tasks/hooks/useTaskActions';
import { TodayTimeline } from '../components/TodayTimeline';
import { useTodaySummary } from '../hooks/useTodaySummary';

/** The morning check-in surface: commitments, work, and remaining capacity. */
export function TodayScreen() {
  const theme = useTheme();
  const summary = useTodaySummary();
  const openQuickAdd = useQuickAddStore((state) => state.open);
  const openNewEvent = useEventEditorStore((state) => state.openNew);
  const openEvent = useEventEditorStore((state) => state.openEvent);
  const openTask = useTaskEditorStore((state) => state.openTask);
  const actions = useTaskActions();

  if (summary.isLoading) return <LoadingState fullScreen label="Getting your day ready" />;

  if (summary.isError) {
    return (
      <ErrorState
        title="We could not load your day"
        message="Check your connection and try again."
        onRetry={summary.refetch}
      />
    );
  }

  const firstName = summary.fullName?.split(' ')[0];
  const heading = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: summary.timeZone,
  }).format(summary.now);
  const next = summary.next;
  const nextTitle = next
    ? next.kind === 'event'
      ? next.occurrence.event.title
      : next.task.title
    : 'Your day is open';
  const nextMeta = next
    ? next.kind === 'event'
      ? next.occurrence.event.allDay
        ? 'All day'
        : formatTimeOfDay(new Date(next.start), summary.timeZone, summary.hourCycle)
      : `Task at ${formatTimeOfDay(new Date(next.start), summary.timeZone, summary.hourCycle)}`
    : 'No upcoming commitments or timed work.';
  const focusedTaskCount =
    summary.buckets.overdue.length + summary.buckets.dueToday.length + summary.unscheduled.length;

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="caption" color="tertiary" uppercase>
            {heading}
          </Text>
          <Text variant="display">{firstName ? `Hello, ${firstName}` : 'Today'}</Text>
        </View>
        <IconButton
          name="search-outline"
          accessibilityLabel="Search"
          onPress={() => router.push('/(tabs)/search')}
        />
      </View>

      <Card
        eyebrow={next ? (next.kind === 'event' ? 'Up next' : 'Next task') : 'Up next'}
        title={nextTitle}
        onPress={
          next
            ? () =>
                next.kind === 'event' ? openEvent(next.occurrence.event.id) : openTask(next.task.id)
            : undefined
        }
      >
        <Text variant="callout" color="secondary">
          {nextMeta}
        </Text>
      </Card>

      <Card
        eyebrow="Open time"
        title={
          summary.freeTime.freeMinutes > 0
            ? `${formatDuration(summary.freeTime.freeMinutes)} free`
            : 'No open work time'
        }
      >
        <Text variant="callout" color="secondary">
          {summary.freeTime.intervals.length > 0
            ? `${summary.freeTime.intervals.length} open window${
                summary.freeTime.intervals.length === 1 ? '' : 's'
              } inside your working hours.`
            : 'Your working hours are either finished or covered by calendar commitments.'}
        </Text>
      </Card>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Schedule" count={summary.timeline.length} />
        <TodayTimeline
          items={summary.timeline}
          lists={summary.taskLists}
          timeZone={summary.timeZone}
          hourCycle={summary.hourCycle}
          now={summary.now}
          onOpenEvent={openEvent}
          onOpenTask={openTask}
          onToggleComplete={actions.onToggleComplete}
          onSnooze={actions.onSnooze}
          onDelete={actions.onDelete}
          onAddEvent={() => openNewEvent(summary.dayStart)}
        />
      </View>

      {focusedTaskCount === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="checkmark-circle-outline"
            title="No task pressure today"
            message="Capture something you need to do and it will appear here."
            actionLabel="Add a task"
            onAction={() => openQuickAdd('task')}
          />
        </Card>
      ) : (
        <>
          <TaskGroup
            title="Overdue"
            tasks={summary.buckets.overdue}
            lists={summary.taskLists}
            timeZone={summary.timeZone}
            hourCycle={summary.hourCycle}
            now={summary.now}
            onToggleComplete={actions.onToggleComplete}
            onOpenTask={actions.onOpenTask}
            onSnooze={actions.onSnooze}
            onDelete={actions.onDelete}
          />
          <TaskGroup
            title="Due today"
            tasks={summary.buckets.dueToday}
            lists={summary.taskLists}
            timeZone={summary.timeZone}
            hourCycle={summary.hourCycle}
            now={summary.now}
            onToggleComplete={actions.onToggleComplete}
            onOpenTask={actions.onOpenTask}
            onSnooze={actions.onSnooze}
            onDelete={actions.onDelete}
          />
          <TaskGroup
            title="Unscheduled"
            tasks={summary.unscheduled}
            lists={summary.taskLists}
            timeZone={summary.timeZone}
            hourCycle={summary.hourCycle}
            now={summary.now}
            onToggleComplete={actions.onToggleComplete}
            onOpenTask={actions.onOpenTask}
            onSnooze={actions.onSnooze}
            onDelete={actions.onDelete}
          />
        </>
      )}
    </View>
  );
}
