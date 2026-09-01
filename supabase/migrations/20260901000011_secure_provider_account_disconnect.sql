-- ============================================================================
-- 0011 — Keep provider-account teardown server-side.
--
-- Disconnect must stop provider watches and delete the Vault secret before the
-- account row disappears. Letting the mobile role delete the row directly
-- bypasses that teardown and can orphan a Google channel or Graph subscription.
-- The integrations-disconnect Edge Function uses the service role instead.
-- ============================================================================

drop policy if exists "Users disconnect their own connections"
  on public.provider_accounts;

revoke delete on public.provider_accounts from public, anon, authenticated;
