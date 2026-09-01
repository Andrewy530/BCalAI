import type { ProviderKind } from '@cal/schemas';
import {
  Badge,
  BottomSheet,
  Divider,
  ErrorState,
  ListRow,
  LoadingState,
  Text,
  useTheme,
} from '@cal/ui';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';

import { useProviderCalendars, useToggleCalendarImport } from '../hooks/useIntegrations';
import { providerMetadata } from '../provider-metadata';

/**
 * Which of an account's calendars to import.
 *
 * The distinction that matters here is import vs. visibility. Un-importing
 * removes the calendar's events from this database entirely, which is safe
 * precisely because the provider still holds them — but it is not the same as
 * hiding a calendar, which lives on the calendar screen.
 */
export interface CalendarPickerSheetProps {
  visible: boolean;
  providerAccountId: string | null;
  provider: ProviderKind | null;
  onClose: () => void;
}

export function CalendarPickerSheet({
  visible,
  providerAccountId,
  provider,
  onClose,
}: CalendarPickerSheetProps) {
  const theme = useTheme();
  const providerName = provider ? providerMetadata(provider).name : 'your provider';
  const { data, isLoading, isError, refetch } = useProviderCalendars(
    visible ? providerAccountId : null,
  );
  const toggle = useToggleCalendarImport();

  // Tracked per calendar so two rows toggled in quick succession each show
  // their own spinner rather than one shared, misleading one.
  const [pending, setPending] = useState<string | null>(null);

  const onToggle = (providerCalendarId: string, imported: boolean) => {
    if (!providerAccountId) return;

    void Haptics.selectionAsync();
    setPending(providerCalendarId);

    toggle.mutate(
      { providerAccountId, providerCalendarId, imported },
      { onSettled: () => setPending(null) },
    );
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Calendars to sync">
      {isLoading ? <LoadingState label="Reading your calendars…" /> : null}

      {isError ? (
        <ErrorState
          title={`Could not reach ${providerName}`}
          message="Your connection may need re-authorising."
          onRetry={() => void refetch()}
        />
      ) : null}

      {data ? (
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 0 }}>
          {data.map((calendar, index) => (
            <View key={calendar.providerCalendarId}>
              {index > 0 ? <Divider inset /> : null}
              <ListRow
                title={calendar.name}
                subtitle={
                  calendar.isPrimary ? 'Primary calendar' : (calendar.timezone ?? undefined)
                }
                accentColor={calendar.color ?? undefined}
                trailing={
                  pending === calendar.providerCalendarId ? (
                    <ActivityIndicator />
                  ) : (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                    >
                      {calendar.isReadOnly ? <Badge label="Read-only" /> : null}
                      <Switch
                        value={calendar.isImported}
                        onValueChange={(next) => onToggle(calendar.providerCalendarId, next)}
                        accessibilityLabel={`Sync ${calendar.name}`}
                      />
                    </View>
                  )
                }
              />
            </View>
          ))}

          {data.length === 0 ? (
            <Text variant="footnote" color="secondary" style={{ padding: theme.spacing.lg }}>
              This account has no calendars we can read.
            </Text>
          ) : null}
        </ScrollView>
      ) : null}

      <Text variant="footnote" color="tertiary" style={{ paddingTop: theme.spacing.md }}>
        Turning a calendar off removes its events from this app. They stay with {providerName}.
      </Text>
    </BottomSheet>
  );
}
