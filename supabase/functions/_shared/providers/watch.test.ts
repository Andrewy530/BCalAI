import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import {
  watchRegistrationFromState,
  watchRegistrationIsHealthy,
  watchRenewalThreshold,
  type StoredWatchState,
} from './watch.ts';

function state(overrides: Partial<StoredWatchState> = {}): StoredWatchState {
  return {
    webhook_channel_id: 'channel-1',
    webhook_resource_id: null,
    webhook_subscription_id: null,
    webhook_token: null,
    webhook_expires_at: null,
    ...overrides,
  };
}

Deno.test('reconstructs a Google registration from its resource id', () => {
  assertEquals(
    watchRegistrationFromState(
      state({
        webhook_resource_id: 'resource-1',
        webhook_token: 'google-secret',
        webhook_expires_at: '2026-09-08T00:00:00.000Z',
      }),
      'fallback-expiry',
    ),
    {
      channelId: 'channel-1',
      resourceId: 'resource-1',
      subscriptionId: null,
      token: 'google-secret',
      expiresAt: '2026-09-08T00:00:00.000Z',
    },
  );
});

Deno.test('reconstructs a Graph registration from its subscription id', () => {
  assertEquals(
    watchRegistrationFromState(
      state({ webhook_subscription_id: 'subscription-1' }),
      'fallback-expiry',
    ),
    {
      channelId: 'channel-1',
      resourceId: null,
      subscriptionId: 'subscription-1',
      token: '',
      expiresAt: 'fallback-expiry',
    },
  );
});

Deno.test('does not reconstruct a registration without a channel identity', () => {
  assertEquals(
    watchRegistrationFromState(
      state({ webhook_channel_id: null, webhook_resource_id: 'resource-1' }),
      'fallback-expiry',
    ),
    null,
  );
});

Deno.test('does not reconstruct a registration without either provider identifier', () => {
  assertEquals(watchRegistrationFromState(state(), 'fallback-expiry'), null);
});

Deno.test('preserves both provider identifiers when both are present', () => {
  assertEquals(
    watchRegistrationFromState(
      state({
        webhook_resource_id: 'resource-1',
        webhook_subscription_id: 'subscription-1',
      }),
      'fallback-expiry',
    ),
    {
      channelId: 'channel-1',
      resourceId: 'resource-1',
      subscriptionId: 'subscription-1',
      token: '',
      expiresAt: 'fallback-expiry',
    },
  );
});

Deno.test('recognizes a non-expired registration with a webhook secret as healthy', () => {
  const registration = watchRegistrationFromState(
    state({
      webhook_subscription_id: 'subscription-1',
      webhook_token: 'client-state',
      webhook_expires_at: '2026-09-04T00:00:00.000Z',
    }),
    'fallback-expiry',
  );

  assertEquals(
    watchRegistrationIsHealthy(registration, new Date('2026-09-01T00:00:00.000Z')),
    true,
  );
});

Deno.test('requires the full renewal margin before reusing a registration', () => {
  const now = new Date('2026-09-01T00:00:00.000Z');
  const registration = watchRegistrationFromState(
    state({
      webhook_subscription_id: 'subscription-1',
      webhook_token: 'client-state',
      webhook_expires_at: watchRenewalThreshold(now).toISOString(),
    }),
    'fallback-expiry',
  );

  assertEquals(watchRegistrationIsHealthy(registration, now), false);
  assertEquals(
    watchRegistrationIsHealthy({ ...registration!, expiresAt: '2026-09-03T00:00:00.001Z' }, now),
    true,
  );
});

Deno.test('does not reuse an expired or secretless registration', () => {
  const expired = watchRegistrationFromState(
    state({
      webhook_subscription_id: 'subscription-1',
      webhook_token: 'client-state',
      webhook_expires_at: '2026-08-31T23:59:59.000Z',
    }),
    'fallback-expiry',
  );
  const secretless = watchRegistrationFromState(
    state({
      webhook_subscription_id: 'subscription-2',
      webhook_expires_at: '2026-09-02T00:00:00.000Z',
    }),
    'fallback-expiry',
  );

  assertEquals(watchRegistrationIsHealthy(expired, new Date('2026-09-01T00:00:00.000Z')), false);
  assertEquals(watchRegistrationIsHealthy(secretless, new Date('2026-09-01T00:00:00.000Z')), false);
});
