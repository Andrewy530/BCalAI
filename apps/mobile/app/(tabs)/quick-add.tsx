import { Redirect } from 'expo-router';

/**
 * Placeholder route for the quick-add action. The floating button opens the
 * Quick Add sheet, so this is only reached via a stray deep link.
 */
export default function QuickAddRoute() {
  return <Redirect href="/(tabs)/today" />;
}
