import { describeRRule, parseRRule, RECURRENCE_PRESETS } from '@cal/domain';
import { Chip, Text, useTheme } from '@cal/ui';
import { View } from 'react-native';

export interface RecurrenceFieldProps {
  value: string | null;
  onChange: (rrule: string | null) => void;
}

/**
 * Recurrence as a short list of presets.
 *
 * A rule that arrived from Google or Microsoft may be more complex than the
 * presets can express. Rather than silently rewriting it, the field shows what
 * the rule says and leaves it alone unless the user picks something else.
 */
export function RecurrenceField({ value, onChange }: RecurrenceFieldProps) {
  const theme = useTheme();

  const parsed = value ? parseRRule(value) : null;
  const matchesPreset = RECURRENCE_PRESETS.some((preset) => preset.rrule === value);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="subhead" color="secondary">
        Repeat
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {RECURRENCE_PRESETS.map((preset) => (
          <Chip
            key={preset.label}
            label={preset.label}
            selected={value === preset.rrule}
            onPress={() => onChange(preset.rrule)}
          />
        ))}
      </View>

      {value && !matchesPreset ? (
        <Text variant="footnote" color="tertiary">
          {parsed
            ? `Currently: ${describeRRule(parsed)}`
            : 'This event uses a repeat rule set elsewhere. Changing it here will replace it.'}
        </Text>
      ) : null}
    </View>
  );
}
