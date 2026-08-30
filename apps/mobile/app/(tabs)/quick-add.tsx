import { Redirect } from 'expo-router';

/**
 * Placeholder route for the centre tab. The tab bar intercepts the press and
 * opens the Quick Add sheet, so this is only reached via a stray deep link.
 */
export default function QuickAddRoute() {
  return <Redirect href="/(tabs)/today" />;
}
