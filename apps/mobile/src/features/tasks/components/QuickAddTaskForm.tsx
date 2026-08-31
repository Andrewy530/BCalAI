import {
  DURATION_PRESETS,
  addZonedDays,
  formatDuration,
  getZonedParts,
  startOfZonedDay,
  zonedWallClockToUtc,
} from '@cal/domain';
import type { TaskPriority } from '@cal/schemas';
import { Button, Chip, Text, TextField, useTheme } from '@cal/ui';
import { useState } from 'react';
import { View } from 'react-native';

import { useTaskEditorStore } from '../../../store/task-editor.store';
import { useUserTimeZone } from '../../settings/hooks/useProfile';
import { useCreateTask } from '../hooks/useTasks';

type DuePreset = 'none' | 'today' | 'tomorrow' | 'next-week';

export interface QuickAddTaskFormProps {
  /** Called after a successful capture so the sheet can dismiss itself. */
  onCaptured: () => void;
  /** Set when opened from a specific day, which pre-selects a due date. */
  seedDateKey?: string | null;
}

/**
 * Quick capture. The goal is a captured thought in under five seconds, so the
 * only required input is a title — everything else is a single tap, and the
 * full editor is one tap away for anything more involved.
 */
export function QuickAddTaskForm({ onCaptured, seedDateKey }: QuickAddTaskFormProps) {
  const theme = useTheme();
  const timeZone = useUserTimeZone();
  const createTask = useCreateTask();
  const openEditor = useTaskEditorStore((state) => state.openNew);

  const [title, setTitle] = useState('');
  const [duePreset, setDuePreset] = useState<DuePreset>(seedDateKey ? 'today' : 'none');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolveDueAt = (): string | null => {
    if (duePreset === 'none') return null;

    const startOfToday = startOfZonedDay(new Date(), timeZone);
    const offsets: Record<Exclude<DuePreset, 'none'>, number> = {
      today: 0,
      tomorrow: 1,
      'next-week': 7,
    };

    const day = addZonedDays(startOfToday, offsets[duePreset], timeZone);
    const parts = getZonedParts(day, timeZone);
    // Local noon, so a later time-zone change cannot slide it into another day.
    return zonedWallClockToUtc(
      { year: parts.year, month: parts.month, day: parts.day, hour: 12, minute: 0 },
      timeZone,
    ).toISOString();
  };

  const handleSubmit = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError('Give the task a title');
      return;
    }

    try {
      await createTask.mutateAsync({
        title: trimmed,
        priority,
        dueAt: resolveDueAt(),
        hasDueTime: false,
        estimatedMinutes,
        isFlexible: true,
        tagIds: [],
      });

      setTitle('');
      setDuePreset('none');
      setPriority('normal');
      setEstimatedMinutes(null);
      onCaptured();
    } catch {
      setError('Could not save that. Please try again.');
    }
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <TextField
        value={title}
        onChangeText={(next) => {
          setTitle(next);
          if (error) setError(null);
        }}
        placeholder="What needs doing?"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void handleSubmit()}
        error={error ?? undefined}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subhead" color="secondary">
          When
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {(
            [
              ['none', 'Someday'],
              ['today', 'Today'],
              ['tomorrow', 'Tomorrow'],
              ['next-week', 'Next week'],
            ] as const
          ).map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              selected={duePreset === value}
              onPress={() => setDuePreset(value)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="subhead" color="secondary">
          How long
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {DURATION_PRESETS.slice(0, 4).map((minutes) => (
            <Chip
              key={minutes}
              label={formatDuration(minutes)}
              selected={estimatedMinutes === minutes}
              onPress={() => setEstimatedMinutes(estimatedMinutes === minutes ? null : minutes)}
            />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip
          label="High priority"
          icon="flag-outline"
          selected={priority === 'high' || priority === 'urgent'}
          onPress={() => setPriority(priority === 'high' ? 'normal' : 'high')}
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label="Add task"
          loading={createTask.isPending}
          fullWidth
          onPress={() => void handleSubmit()}
        />
        <Button
          label="More options"
          variant="ghost"
          fullWidth
          onPress={() => {
            onCaptured();
            openEditor(null);
          }}
        />
      </View>
    </View>
  );
}
