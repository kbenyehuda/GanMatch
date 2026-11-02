-- Visitor analytics (2026-11-02): who visited, when, what they pressed, which shared link brought them.
-- Reuses telemetry_events. Guests get an anonymous visitor_id (localStorage); signed-in users also carry user_id.
-- Admins' own visits are not logged (the collect API skips them).

alter table public.telemetry_events
  add column if not exists visitor_id text null,
  add column if not exists session_id text null;

create index if not exists idx_telemetry_events_created_at on public.telemetry_events (created_at desc);
create index if not exists idx_telemetry_events_visitor_created_at on public.telemetry_events (visitor_id, created_at desc);

-- One JSON summary for /admin/analytics, computed in the database (PostgREST caps plain selects at 1000 rows).
-- A "person" is the account when known; a guest device that later signed in is folded into that account.
create or replace function public.analytics_summary(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select * from public.telemetry_events
    where created_at >= p_since and visitor_id is not null -- only visitor tracking, not the old (Mar–Apr 2026) unlock-funnel rows
  ),
  vmap as (
    select visitor_id, (array_agg(user_id::text order by created_at desc))[1] as uid
    from public.telemetry_events
    where visitor_id is not null and user_id is not null
    group by visitor_id
  ),
  e as (
    select ev.*,
      coalesce(ev.user_id::text, vmap.uid, 'v:' || ev.visitor_id) as person,
      (ev.created_at at time zone 'Asia/Jerusalem') as local_ts
    from ev left join vmap using (visitor_id)
  ),
  opens as (
    select session_id, person, metadata from e where event_name = 'app_open'
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'people', count(distinct person),
        'signed_in', count(distinct person) filter (where person not like 'v:%'),
        'visits', count(distinct session_id),
        'events', count(*),
        'place_opens', count(*) filter (where event_name = 'place_opened'),
        'contact_clicks', count(*) filter (where event_name in ('call', 'website', 'navigate', 'whatsapp'))
      ) from e
    ),
    'by_day', coalesce((
      select jsonb_agg(d order by d->>'day') from (
        select jsonb_build_object('day', local_ts::date, 'people', count(distinct person),
          'visits', count(distinct session_id), 'events', count(*)) as d
        from e group by local_ts::date
      ) x
    ), '[]'::jsonb),
    'by_hour', coalesce((
      select jsonb_agg(h order by (h->>'hour')::int) from (
        select jsonb_build_object('hour', extract(hour from local_ts)::int, 'visits', count(distinct session_id)) as h
        from e group by extract(hour from local_ts)::int
      ) x
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object('event', event_name, 'count', count(*), 'people', count(distinct person)) as x
        from e group by event_name
      ) y
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(x order by (x->>'visits')::int desc) from (
        select jsonb_build_object(
          'src', coalesce(nullif(metadata->>'src', ''), nullif(metadata->>'ref', ''), 'ישיר'),
          'visits', count(distinct session_id), 'people', count(distinct person)) as x
        from opens
        group by coalesce(nullif(metadata->>'src', ''), nullif(metadata->>'ref', ''), 'ישיר')
      ) y
    ), '[]'::jsonb),
    'places', coalesce((
      select jsonb_agg(x order by (x->>'opens')::int desc) from (
        select jsonb_build_object(
          'place_id', e.entity_id,
          'name', coalesce(max(p.name), max(e.metadata->>'name')),
          'category', max(e.metadata->>'category'),
          'opens', count(*) filter (where event_name = 'place_opened'),
          'people', count(distinct person) filter (where event_name = 'place_opened'),
          'clicks', count(*) filter (where event_name in ('call', 'website', 'navigate', 'whatsapp', 'share', 'save'))
        ) as x
        from e left join public.places p on p.id::text = e.entity_id
        where e.entity_id is not null
          and event_name in ('place_opened', 'call', 'website', 'navigate', 'whatsapp', 'share', 'save')
        group by e.entity_id
        order by count(*) filter (where event_name = 'place_opened') desc
        limit 100
      ) y
    ), '[]'::jsonb),
    'searches', coalesce((
      select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object('q', lower(trim(metadata->>'q')), 'count', count(*), 'people', count(distinct person)) as x
        from e where event_name = 'search' and coalesce(trim(metadata->>'q'), '') <> ''
        group by lower(trim(metadata->>'q'))
        order by count(*) desc
        limit 50
      ) y
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(x order by x->>'last_seen' desc) from (
        select jsonb_build_object(
          'person', person,
          'first_seen', min(created_at), 'last_seen', max(created_at),
          'visits', count(distinct session_id), 'events', count(*),
          'place_opens', count(*) filter (where event_name = 'place_opened'),
          'contact_clicks', count(*) filter (where event_name in ('call', 'website', 'navigate', 'whatsapp')),
          'src', (array_agg(coalesce(nullif(metadata->>'src', ''), nullif(metadata->>'ref', '')) order by created_at)
                  filter (where event_name = 'app_open'))[1],
          'device', (array_agg(metadata->>'device' order by created_at desc) filter (where event_name = 'app_open'))[1]
        ) as x
        from e group by person
        order by max(created_at) desc
        limit 300
      ) y
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('at', created_at, 'person', person, 'event', event_name,
          'place_id', entity_id, 'meta', metadata) as x
        from e order by created_at desc limit 200
      ) y
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.analytics_summary(timestamptz) from public, anon, authenticated;

-- Retention: raw events are kept 12 months (same as the rest of /privacy §8). Same body as before + telemetry.
create or replace function public.retention_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.place_review_contact_messages where created_at < now() - interval '12 months';
  delete from public.place_detail_requests   where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  delete from public.place_location_requests where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  delete from public.telemetry_events where created_at < now() - interval '12 months';
$$;

revoke all on function public.retention_cleanup() from public, anon, authenticated;

notify pgrst, 'reload schema';
