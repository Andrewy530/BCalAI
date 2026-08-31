import { PRIORITY_LABELS, describeTaskDue, formatDuration, isNotablePriority } from '@cal/domain';
import type { HourCycle, Task, TaskPriority } from '@cal/schemas';
import { Checkbox, Text, strikeThroughStyle, useTheme } from '@cal/ui';
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

export interface TaskRowProps {
  task: Task;
  /** Name of the list the task belongs to, if any. */
  listName?: string;
  listColor?: string;
  timeZone: string;
  hourCycle: HourCycle;
  now: Date;
  onToggleComplete: (completed: boolean) => void;
  onPress: () => void;
  onSnooze?: () => void;
  onDelete?: () => void;
}

/**
 * One line in the inbox or on Today.
 *
 * The row carries four pieces of information at a glance — done state,
 * urgency, when it is due, and how long it takes — without becoming noisy. The
 * priority tint is applied to the checkbox ring rather than added as a
 * separate badge, which keeps the row to a single visual column.
 */
export function TaskRow({
  task,
  listName,
  listColor,
  timeZone,
  hourCycle,
  now,
  onToggleComplete,
  onPress,
  onSnooze,
  onDelete,
}: TaskRowProps) {
  const theme = useTheme();
  const swipeableRef = useRef<SwipeableMethods>(null);

  const completed = task.status === 'completed';
  const due = describeTaskDue(task, { now, timeZone, hourCycle });

  const priorityColor: Record<TaskPriority, string | undefined> = {
    urgent: theme.colors.danger,
    high: theme.colors.warning,
    normal: undefined,
    low: undefined,
  };

  const dueColor =
    due.tone === 'overdue'
      ? theme.colors.danger
      : due.tone === 'today'
        ? theme.colors.accent
        : theme.colors.textTertiary;

  const metaParts: string[] = [];
  if (listName) metaParts.push(listName);
  if (task.estimatedMinutes) metaParts.push(formatDuration(task.estimatedMinutes));

  const renderRightActions = () => (
    <View style={{ flexDirection: 'row' }}>
      {onSnooze ? (
        <SwipeAction
          icon="time-outline"
          label="Snooze"
          background={theme.colors.warningSubtle}
          tint={theme.colors.warning}
          onPress={() => {
            swipeableRef.current?.close();
            onSnooze();
          }}
        />
      ) : null}
      {onDelete ? (
        <SwipeAction
          icon="trash-outline"
          label="Delete"
          background={theme.colors.dangerSubtle}
          tint={theme.colors.danger}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        />
      ) : null}
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      enabled={!!onSnooze || !!onDelete}
      renderRightActions={onSnooze || onDelete ? renderRightActions : undefined}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={task.title}
        accessibilityHint="Opens the task editor"
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            minHeight: theme.hitSlopSize + theme.spacing.sm,
            backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface,
          },
        ]}
      >
        <Checkbox
          checked={completed}
          onChange={onToggleComplete}
          color={priorityColor[task.priority]}
          accessibilityLabel={completed ? `Mark ${task.title} not done` : `Complete ${task.title}`}
          testID={`task-checkbox-${task.id}`}
        />

        <View style={styles.body}>
          <Text
            variant="body"
            numberOfLines={2}
            color={completed ? 'tertiary' : 'primary'}
            style={completed ? strikeThroughStyle : undefined}
          >
            {task.title}
          </Text>

          {metaParts.length > 0 || due.tone !== 'none' ? (
            <View style={[styles.meta, { gap: theme.spacing.sm }]}>
              {due.tone !== 'none' ? (
                <View style={[styles.meta, { gap: theme.spacing.xs }]}>
                  {due.tone === 'overdue' ? (
                    <Ionicons name="alert-circle" size={12} color={dueColor} />
                  ) : null}
                  <Text variant="footnote" style={{ color: dueColor }}>
                    {due.text}
                  </Text>
                </View>
              ) : null}

              {metaParts.length > 0 ? (
                <Text variant="footnote" color="tertiary" numberOfLines={1}>
                  {due.tone !== 'none' ? '· ' : ''}
                  {metaParts.join(' · ')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {isNotablePriority(task.priority) && !completed ? (
          <View
            accessibilityLabel={`${PRIORITY_LABELS[task.priority]} priority`}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: priorityColor[task.priority] ?? theme.colors.accent,
            }}
          />
        ) : null}

        {listColor && !listName ? (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: listColor }} />
        ) : null}

        {task.scheduledEventId ? (
          <Ionicons name="calendar" size={14} color={theme.colors.textTertiary} />
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

function SwipeAction({
  icon,
  label,
  background,
  tint,
  onPress,
}: {
  icon: 'time-outline' | 'trash-outline';
  label: string;
  background: string;
  tint: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 76,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xxs,
        backgroundColor: background,
      }}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text variant="caption" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center' },
});
