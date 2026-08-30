import { View } from 'react-native';

import { DURATION_PRESETS, formatDuration } from '@cal/domain';
import { Chip, Text, useTheme } from '@cal/ui';

export interface DurationFieldProps {
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * An estimate is what makes a task schedulable later, so the field is present
 * from Sprint 1 even though "Find Time" is not. Tapping the selected chip
 * clears it — an estimate should never be mandatory.
 */
export function DurationField({ value, onChange }: DurationFieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        How long will it take?
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {DURATION_PRESETS.map((minutes) => (
          <Chip
            key={minutes}
            label={formatDuration(minutes)}
            selected={value === minutes}
            onPress={() => onChange(value === minutes ? null : minutes)}
          />
        ))}
      </View>
    </View>
  );
}
