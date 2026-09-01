-- ============================================================================
-- 0009 — Account-scoped provider watch bookkeeping.
--
-- Microsoft Graph subscriptions are account-scoped rather than one per
-- imported calendar. Keep that registration on the connection itself; the
-- existing calendar_sync_states columns remain the storage for Google-style
-- calendar-scoped channels.
--
-- These identifiers and client-state tokens are server-only. The explicit
-- column revoke below protects them even if the table's safe-column grant is
-- widened in a later migration, and the public projection intentionally does
-- not select them.
-- ============================================================================

alter table public.provider_accounts
  add column webhook_channel_id text,
  add column webhook_resource_id text,
  add column webhook_subscription_id text,
  add column webhook_token text,
  add column webhook_expires_at timestamptz;

create index provider_accounts_watch_expiry_idx
  on public.provider_accounts (webhook_expires_at)
  where webhook_expires_at is not null;

revoke select (
  webhook_channel_id,
  webhook_resource_id,
  webhook_subscription_id,
  webhook_token,
  webhook_expires_at
) on public.provider_accounts from public, anon, authenticated;

comment on column public.provider_accounts.webhook_channel_id is
  'Server-only provider watch channel identifier for an account-scoped registration.';
comment on column public.provider_accounts.webhook_resource_id is
  'Server-only provider resource identifier for an account-scoped registration.';
comment on column public.provider_accounts.webhook_subscription_id is
  'Server-only provider subscription identifier for an account-scoped registration.';
comment on column public.provider_accounts.webhook_token is
  'Server-only secret echoed by the provider on account-scoped notifications.';
comment on column public.provider_accounts.webhook_expires_at is
  'Expiry of the account-scoped provider watch; used by renewal cron.';
