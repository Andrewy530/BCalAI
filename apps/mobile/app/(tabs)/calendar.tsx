import { Screen } from '@cal/ui';

import { CalendarScreen } from '../../src/features/calendar/screens/CalendarScreen';

export default function CalendarScreenRoute() {
  // The day and week timelines scroll internally, so the Screen must not add
  // a second vertical ScrollView around them.
  return (
    <Screen scrollable={false}>
      <CalendarScreen />
    </Screen>
  );
}
