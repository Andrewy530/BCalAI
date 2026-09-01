import { assertEquals } from 'jsr:@std/assert@^1.0.0';

import { handleMicrosoftWebhook, type MicrosoftWebhookAccount } from './handler.ts';

const account: MicrosoftWebhookAccount = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: '22222222-2222-2222-2222-222222222222',
  status: 'active',
  webhook_subscription_id: 'subscription-1',
  webhook_token: 'client-state',
};

const request = (
  body: unknown,
  url = 'https://project.example.com/functions/v1/webhook-microsoft',
) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

Deno.test('echoes Graph validation tokens as plain text immediately', async () => {
  const response = await handleMicrosoftWebhook(
    request(null, 'https://project.example.com/webhook-microsoft?validationToken=token%2Bvalue'),
  );

  assertEquals(response.status, 200);
  assertEquals(await response.text(), 'token+value');
  assertEquals(response.headers.get('Content-Type'), 'text/plain; charset=utf-8');
});

Deno.test('enqueues one account reconciliation for a valid clientState', async () => {
  const jobs: Array<Record<string, unknown>> = [];
  const response = await handleMicrosoftWebhook(
    request({
      value: [
        {
          subscriptionId: 'subscription-1',
          clientState: 'client-state',
          changeType: 'updated',
          resource: 'users/me/events/event-1',
        },
        {
          subscriptionId: 'subscription-1',
          clientState: 'client-state',
          changeType: 'updated',
          resource: 'users/me/events/event-2',
        },
      ],
    }),
    {
      lookupAccounts: async () => [account],
      enqueue: async (job) => {
        jobs.push(job as unknown as Record<string, unknown>);
        return 'job-id';
      },
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
  );

  assertEquals(response.status, 202);
  assertEquals(jobs.length, 1);
  assertEquals(jobs[0]?.kind, 'account.sync');
  assertEquals(jobs[0]?.providerAccountId, account.id);
});

Deno.test('ignores invalid state and unknown subscriptions without enqueueing', async () => {
  const jobs: unknown[] = [];
  const response = await handleMicrosoftWebhook(
    request({
      value: [
        { subscriptionId: 'subscription-1', clientState: 'wrong', changeType: 'updated' },
        { subscriptionId: 'unknown', clientState: 'client-state', changeType: 'updated' },
      ],
    }),
    {
      lookupAccounts: async () => [account],
      enqueue: async (job) => {
        jobs.push(job);
        return null;
      },
    },
  );

  assertEquals(response.status, 202);
  assertEquals(jobs.length, 0);
});

Deno.test('queues renewal after a subscription removal lifecycle notification', async () => {
  const kinds: string[] = [];
  const response = await handleMicrosoftWebhook(
    request({
      value: [
        {
          subscriptionId: 'subscription-1',
          clientState: 'client-state',
          lifecycleEvent: 'subscriptionRemoved',
        },
      ],
    }),
    {
      lookupAccounts: async () => [account],
      enqueue: async (job) => {
        kinds.push(job.kind);
        return 'job-id';
      },
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
  );

  assertEquals(response.status, 202);
  assertEquals(kinds, ['account.sync', 'watch.renew']);
});

Deno.test('does not lose lifecycle renewal when a batch starts with a regular change', async () => {
  const kinds: string[] = [];
  const response = await handleMicrosoftWebhook(
    request({
      value: [
        { subscriptionId: 'subscription-1', clientState: 'client-state', changeType: 'updated' },
        {
          subscriptionId: 'subscription-1',
          clientState: 'client-state',
          lifecycleEvent: 'reauthorizationRequired',
        },
      ],
    }),
    {
      lookupAccounts: async () => [account],
      enqueue: async (job) => {
        kinds.push(job.kind);
        return 'job-id';
      },
      now: () => new Date('2026-01-01T00:00:00Z'),
    },
  );

  assertEquals(response.status, 202);
  assertEquals(kinds, ['account.sync', 'watch.renew']);
});

Deno.test('acknowledges malformed or empty notification bodies', async () => {
  assertEquals(
    (
      await handleMicrosoftWebhook(
        new Request('https://project.example.com/webhook-microsoft', { method: 'POST' }),
      )
    ).status,
    202,
  );
  assertEquals((await handleMicrosoftWebhook(request({ value: [] }))).status, 202);
});
