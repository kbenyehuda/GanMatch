-- Retention promised on /privacy §8 (user, 2026-10-30): messages to recommenders up to 12 months,
-- edit and pin-fix requests up to a year after they were handled. Runs on the 1st of every month, 03:00 UTC.

create extension if not exists pg_cron;

create or replace function public.retention_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.place_review_contact_messages where created_at < now() - interval '12 months';
  delete from public.place_detail_requests   where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  delete from public.place_location_requests where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
$$;

revoke all on function public.retention_cleanup() from public, anon, authenticated;

-- Same name again replaces the schedule, so re-running this file is safe
select cron.schedule('retention-cleanup', '0 3 1 * *', 'select public.retention_cleanup()');
