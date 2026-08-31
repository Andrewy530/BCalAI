import { Screen } from '@cal/ui';

import { IntegrationsScreen } from '../../src/features/integrations';

/**
 * Also the OAuth return target: the callback function redirects to
 * `calendarapp://settings/integrations`, which resolves to this route.
 */
export default function IntegrationsRoute() {
  return (
    <Screen>
      <IntegrationsScreen />
    </Screen>
  );
}
