import { Redirect } from 'expo-router';

/** Entry point. AuthGate in the root layout takes over from here. */
export default function Index() {
  return <Redirect href="/(tabs)/today" />;
}
