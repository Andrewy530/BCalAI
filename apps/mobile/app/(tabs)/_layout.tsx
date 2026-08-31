import { useTheme } from '@cal/ui';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QuickAddButton } from '../../src/components/app-shell/QuickAddButton';

const NATIVE_TAB_BAR_CLEARANCE = 72;

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <NativeTabs
        iconColor={{ default: theme.colors.textTertiary, selected: theme.colors.accent }}
        labelStyle={{
          default: { color: theme.colors.textTertiary },
          selected: { color: theme.colors.accent },
        }}
        minimizeBehavior="automatic"
      >
        <NativeTabs.Trigger name="today">
          <Icon sf={{ default: 'sun.max', selected: 'sun.max.fill' }} />
          <Label>Today</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="calendar">
          <Icon sf={{ default: 'calendar', selected: 'calendar' }} />
          <Label>Calendar</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="tasks">
          <Icon sf={{ default: 'checkmark.square', selected: 'checkmark.square.fill' }} />
          <Label>Tasks</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
          <Label>Settings</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="quick-add" hidden />
        <NativeTabs.Trigger name="search" hidden />
      </NativeTabs>

      {/* Quick Add is an action, so it sits above the native navigation bar. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.quickAddOverlay,
          {
            bottom: insets.bottom + NATIVE_TAB_BAR_CLEARANCE,
            right: theme.screenPadding,
          },
        ]}
      >
        <QuickAddButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  quickAddOverlay: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
    zIndex: 10,
  },
});
