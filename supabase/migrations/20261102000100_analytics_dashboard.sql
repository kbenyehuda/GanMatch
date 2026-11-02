-- /admin/analytics v2 (2026-11-02): pulse KPIs, demand (filters, zero-result searches), intent funnel,
-- content inflow (reviews by category, seeded vs organic) and the moderation queue.
-- p_until bounds the range so the API can call it again for the previous period (trend arrows).
-- p_category (kids/doctor/cosmetics/…) narrows place-related numbers; null = all.

drop function if exists public.analytics_summary(timestamptz);

create or replace function public.analytics_summary(p_since timestamptz, p_until timestamptz default now(), p_category text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select * from public.telemetry_events
    where created_at >= p_since and created_at < p_until and visitor_id is not null
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
      (ev.created_at at time zone 'Asia/Jerusalem') as local_ts,
      (p_category is null or ev.metadata->>'category' = p_category) as in_cat
    from ev left join vmap using (visitor_id)
  ),
  opens as (
    select session_id, person, metadata from e where event_name = 'app_open'
  ),
  outbound as (select unnest(array['call', 'whatsapp', 'website', 'navigate', 'save', 'share']) as name),
  vis_places as (
    select id, name, place_category::text as cat, rec_count from public.places
    where not coalesce(is_hidden, false) and (p_category is null or place_category::text = p_category)
  ),
  rv as (
    select r.*, p.name as place_name, p.place_category::text as cat
    from public.place_reviews r join public.places p on p.id = r.place_id
    where (p_category is null or p.place_category::text = p_category)
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'people', count(distinct person),
        'signed_in', count(distinct person) filter (where person not like 'v:%'),
        'visits', count(distinct session_id),
        'events', count(*),
        'place_opens', count(*) filter (where event_name = 'place_opened' and in_cat),
        'contact_clicks', count(*) filter (where event_name in ('call', 'website', 'navigate', 'whatsapp') and in_cat)
      ) from e
    ),
    'pulse', jsonb_build_object(
      'dau', (select count(distinct person) from e where created_at >= p_until - interval '1 day'),
      'wau', (select count(distinct person) from e where created_at >= p_until - interval '7 days'),
      'sessions', (select count(distinct session_id) from e),
      'intent_sessions', (select count(distinct session_id) from e where event_name in (select name from outbound) and in_cat),
      'reviews_seeded', (select count(*) from rv where whatsapp_reviewer_name is not null),
      'reviews_organic', (select count(*) from rv where whatsapp_reviewer_name is null),
      'organic_in_range', (select count(*) from rv where whatsapp_reviewer_name is null and created_at >= p_since and created_at < p_until),
      'places_total', (select count(*) from vis_places),
      'places_3plus', (select count(*) from vis_places where rec_count >= 3)
    ),
    'funnel', (
      select jsonb_build_object(
        'visits', count(distinct session_id),
        'opened', count(distinct session_id) filter (where event_name = 'place_opened' and in_cat),
        'reviews', count(distinct session_id) filter (where event_name in ('reviews_seen', 'helpful') and in_cat),
        'outbound', count(distinct session_id) filter (where event_name in (select name from outbound) and in_cat)
      ) from e
    ),
    'filters', coalesce((
      select jsonb_agg(x order by (x->>'sessions')::int desc) from (
        select jsonb_build_object(
          'label', coalesce(metadata->>'label', metadata->>'key') || ': ' || lbl,
          'category', max(metadata->>'category'),
          'count', count(*), 'sessions', count(distinct session_id)) as x
        from e, jsonb_array_elements_text(coalesce(metadata->'labels', metadata->'values', '[]'::jsonb)) as lbl
        where event_name = 'filter_changed' and in_cat
        group by coalesce(metadata->>'label', metadata->>'key') || ': ' || lbl
        order by count(distinct session_id) desc
        limit 15
      ) y
    ), '[]'::jsonb),
    'zero_searches', coalesce((
      select jsonb_agg(x order by x->>'last' desc) from (
        select jsonb_build_object('q', lower(trim(metadata->>'q')), 'count', count(*), 'last', max(created_at)) as x
        from e
        where event_name = 'search' and metadata->>'results' = '0' and coalesce(trim(metadata->>'q'), '') <> ''
        group by lower(trim(metadata->>'q'))
        order by max(created_at) desc
        limit 30
      ) y
    ), '[]'::jsonb),
    'new_reviews', coalesce((
      select jsonb_agg(x order by x->>'day') from (
        select jsonb_build_object('day', (created_at at time zone 'Asia/Jerusalem')::date, 'cat', cat,
          'organic', count(*) filter (where whatsapp_reviewer_name is null),
          'seeded', count(*) filter (where whatsapp_reviewer_name is not null)) as x
        from rv where created_at >= p_since and created_at < p_until
        group by 1, cat
      ) y
    ), '[]'::jsonb),
    'review_mix', (
      select jsonb_build_object(
        'seeded', count(*) filter (where whatsapp_reviewer_name is not null),
        'anonymous', count(*) filter (where whatsapp_reviewer_name is null and is_anonymous),
        'named', count(*) filter (where whatsapp_reviewer_name is null and not coalesce(is_anonymous, false))
      ) from rv
    ),
    'queue', jsonb_build_object(
      'held_reviews', (select count(*) from rv where check_status = 'held'),
      'held_latest', coalesce((
        select jsonb_agg(x order by x->>'at' desc) from (
          select jsonb_build_object('place', place_name, 'place_id', place_id, 'at', created_at, 'reasons', hold_reasons) as x
          from rv where check_status = 'held' order by created_at desc limit 8
        ) y
      ), '[]'::jsonb),
      'detail_requests', (select count(*) from public.place_detail_requests d join vis_places p on p.id = d.place_id where d.status = 'pending'),
      'location_requests', (select count(*) from public.place_location_requests l join vis_places p on p.id = l.place_id where l.status = 'pending'),
      'report_clicks', (select count(*) from e where event_name = 'report' and in_cat),
      'owner_clicks', (select count(*) from e where event_name = 'owner_claim' and in_cat)
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
          'clicks', count(*) filter (where event_name in (select name from outbound))
        ) as x
        from e left join public.places p on p.id::text = e.entity_id
        where e.entity_id is not null and in_cat
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

revoke all on function public.analytics_summary(timestamptz, timestamptz, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
