-- ============================================================================
-- 0007 — Scheduled sync.
--
-- The four jobs from docs/sync-engine.md § Cron jobs. They are what make the
-- system converge without a webhook: notifications are an optimisation, and
-- Google documents that they are not perfectly reliable.
--
-- Guarded end to end. `pg_cron` and `pg_net` exist on hosted Supabase but not
-- in every local stack, and a migration that hard-fails there would break
-- `supabase db reset` for everyone. Where the extensions are missing this
-- migration does nothing and says so.
-- ============================================================================

do $$
declare
  v_base_url text := current_setting('app.settings.functions_url', true);
  v_secret   text := current_setting('app.settings.sync_cron_secret', true);
begin
  if to_regproc('cron.schedule') is null then
    raise notice 'pg_cron is unavailable; skipping sync schedules.';
    return;
  end if;

  if to_regproc('net.http_post') is null then
    raise notice 'pg_net is unavailable; skipping sync schedules.';
    return;
  end if;

  if v_base_url is null or v_secret is null then
    -- Deliberately not an error: a fresh local database has no function URL to
    -- call. Set both settings on the hosted project and re-run this block.
    raise notice 'app.settings.functions_url / sync_cron_secret unset; skipping sync schedules.';
    return;
  end if;

  -- Recreate the channels before they lapse. Hourly, with a two-day window on
  -- the function side, so a single failure is never the last chance.
  perform cron.schedule(
    'sync-renew-watches',
    '7 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Sync-Cron-Secret',%L),
        body := '{}'::jsonb
      )$cmd$,
      v_base_url || '/sync-cron?task=renew-watches', v_secret
    )
  );

  -- Drain failed and queued work. The most frequent job, because it is what
  -- turns a transient provider outage into a delay instead of a lost change.
  perform cron.schedule(
    'sync-retry-failed',
    '*/15 * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Sync-Cron-Secret',%L),
        body := '{}'::jsonb
      )$cmd$,
      v_base_url || '/sync-cron?task=retry-failed', v_secret
    )
  );

  -- Full compare per connection, in case a notification was never delivered.
  perform cron.schedule(
    'sync-reconcile',
    '20 4 * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Sync-Cron-Secret',%L),
        body := '{}'::jsonb
      )$cmd$,
      v_base_url || '/sync-cron?task=reconcile', v_secret
    )
  );

  -- Housekeeping: expired handshakes and succeeded jobs.
  perform cron.schedule(
    'sync-prune',
    '40 5 * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','X-Sync-Cron-Secret',%L),
        body := '{}'::jsonb
      )$cmd$,
      v_base_url || '/sync-cron?task=prune', v_secret
    )
  );

  raise notice 'Sync schedules installed.';
end;
$$;
