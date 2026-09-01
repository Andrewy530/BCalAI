import { adminClient } from '../_shared/auth/index.ts';
import { enqueue, JOB_KINDS } from '../_shared/sync/jobs.ts';
import { microsoftWebhookSchema } from '../_shared/providers/microsoft/schemas.ts';

type MicrosoftWebhookJob = Parameters<typeof enqueue>[1];
type MicrosoftWebhookEnqueue = (job: MicrosoftWebhookJob) => ReturnType<typeof enqueue>;

export interface MicrosoftWebhookAccount {
  id: string;
  user_id: string;
  status: string;
  webhook_subscription_id: string | null;
  webhook_token: string | null;
}

export interface MicrosoftWebhookDeps {
  lookupAccounts?: (subscriptionIds: string[]) => Promise<MicrosoftWebhookAccount[]>;
  enqueue?: MicrosoftWebhookEnqueue;
  now?: () => Date;
}

/**
 * Fast Microsoft Graph notification handler.
 *
 * It acknowledges validation and notifications without calling Graph or
 * draining the queue. A notification is only a hint: the account worker owns
 * the subsequent delta/reconciliation read.
 */
export async function handleMicrosoftWebhook(
  request: Request,
  deps: MicrosoftWebhookDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  const validationToken = new URL(request.url).searchParams.get('validationToken');
  if (validationToken !== null) return validationResponse(validationToken);

  const body = await request.json().catch(() => null);
  const parsed = microsoftWebhookSchema.safeParse(body);
  if (!parsed.success || parsed.data.value.length === 0) return acceptedResponse();

  const notifications = parsed.data.value;
  const subscriptionIds = [
    ...new Set(notifications.map((notification) => notification.subscriptionId)),
  ];
  let accounts: MicrosoftWebhookAccount[];
  try {
    accounts = await (deps.lookupAccounts ?? lookupAccounts)(subscriptionIds);
  } catch {
    // A webhook is recoverable through daily reconciliation. Do not make Graph
    // retry a batch because an internal lookup was temporarily unavailable.
    console.error(JSON.stringify({ code: 'MICROSOFT_WEBHOOK_LOOKUP_FAILED' }));
    return acceptedResponse();
  }

  const accountBySubscription = new Map(
    accounts
      .filter((account) => account.webhook_subscription_id)
      .map((account) => [account.webhook_subscription_id as string, account]),
  );
  const enqueueJob: MicrosoftWebhookEnqueue =
    deps.enqueue ?? ((job) => enqueue(adminClient(), job));
  const now = deps.now ?? (() => new Date());
  const reconciledAccounts = new Set<string>();
  const renewedAccounts = new Set<string>();

  for (const notification of notifications) {
    const account = accountBySubscription.get(notification.subscriptionId);
    if (!account || !sameSecret(notification.clientState, account.webhook_token)) continue;

    try {
      if (!reconciledAccounts.has(account.id)) {
        reconciledAccounts.add(account.id);
        await enqueueJob({
          userId: account.user_id,
          providerAccountId: account.id,
          kind: JOB_KINDS.accountSync,
          idempotencyKey: accountSyncKey(account.id, now()),
        });
      }

      if (
        notification.lifecycleEvent === 'subscriptionRemoved' ||
        notification.lifecycleEvent === 'reauthorizationRequired'
      ) {
        if (!renewedAccounts.has(account.id)) {
          renewedAccounts.add(account.id);
          await enqueueJob({
            userId: account.user_id,
            providerAccountId: account.id,
            kind: JOB_KINDS.watchRenew,
            payload: { scope: 'account' },
            idempotencyKey: accountWatchRenewKey(account.id, now()),
          });
        }
      }
    } catch (error) {
      // The next lifecycle notification or reconciliation pass can recover it;
      // never include provider content or clientState in logs.
      console.error(
        JSON.stringify({
          code: 'MICROSOFT_WEBHOOK_ENQUEUE_FAILED',
          reason: error instanceof Error ? error.name : 'UNKNOWN',
        }),
      );
    }
  }

  return acceptedResponse();
}

async function lookupAccounts(subscriptionIds: string[]): Promise<MicrosoftWebhookAccount[]> {
  const admin = adminClient();
  const { data, error } = await admin
    .from('provider_accounts')
    .select('id, user_id, status, webhook_subscription_id, webhook_token')
    .eq('provider', 'microsoft')
    .in('webhook_subscription_id', subscriptionIds);

  if (error) throw error;
  return (data ?? []) as MicrosoftWebhookAccount[];
}

function accountSyncKey(accountId: string, at: Date): string {
  return `microsoft-webhook:${accountId}:${Math.floor(at.getTime() / 60_000)}`;
}

function accountWatchRenewKey(accountId: string, at: Date): string {
  return `microsoft-watch-renew:${accountId}:${Math.floor(at.getTime() / 60_000)}`;
}

function sameSecret(actual: string | null | undefined, expected: string | null): boolean {
  if (!actual || !expected) return false;
  const left = new TextEncoder().encode(actual);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

function validationResponse(validationToken: string): Response {
  return new Response(validationToken, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function acceptedResponse(): Response {
  return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
}
