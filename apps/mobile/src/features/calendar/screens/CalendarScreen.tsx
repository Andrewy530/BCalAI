import { View } from 'react-native';

import { Card, Chip, EmptyState, Text, useTheme } from '@cal/ui';

import {
  type CalendarViewMode,
  useCalendarViewStore,
} from '../../../store/calendar-view.store';
import { useQuickAddStore } from '../../../store/quick-add.store';

const MODES: { mode: CalendarViewMode; label: string }[] = [
  { mode: 'day', label: 'Day' },
  { mode: 'week', label: 'Week' },
  { mode: 'month', label: 'Month' },
  { mode: 'agenda', label: 'Agenda' },
];

/**
 * Sprint 0 shell. The view switcher is real and drives the store; the four
 * views themselves arrive in Sprint 2 as components under
 * features/calendar/components/{day,week,month,agenda}-view.
 */
export function CalendarScreen() {
  const theme = useTheme();
  const mode = useCalendarViewStore((state) => state.mode);
  const setMode = useCalendarViewStore((state) => state.setMode);
  const openQuickAdd = useQuickAddStore((state) => state.open);

  return (
    <View style={{ gap: theme.spacing.xl }}>
      <Text variant="display">Calendar</Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
        {MODES.map((option) => (
          <Chip
            key={option.mode}
            label={option.label}
            selected={mode === option.mode}
            onPress={() => setMode(option.mode)}
          />
        ))}
      </View>

      <Card padded={false}>
        <EmptyState
          icon="calendar-outline"
          title="Your calendar is empty"
          message="Add an event, or connect Google or Outlook to bring your existing calendars in."
          actionLabel="Add an event"
          onAction={() => openQuickAdd('event')}
        />
      </Card>
    </View>
  );
}
