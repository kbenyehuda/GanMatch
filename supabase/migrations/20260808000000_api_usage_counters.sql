-- Tracks monthly call counts for paid/rate-limited external APIs (OpenAI,
-- Mapbox, Google Places) so the app can refuse further calls once a
-- provider's configured monthly cap is reached, instead of silently
-- accumulating cost. One row per (provider, period) — period is a
-- 'YYYY-MM' string. increment_api_usage() is atomic (single UPSERT with
-- RETURNING) so concurrent calls can't race past the limit.

create table if not exists api_usage_counters (
  provider text not null,
  period text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, period)
);

create or replace function increment_api_usage(p_provider text, p_period text, p_limit integer)
returns boolean
language plpgsql
as $$
declare
  new_count integer;
begin
  insert into api_usage_counters (provider, period, count, updated_at)
  values (p_provider, p_period, 1, now())
  on conflict (provider, period)
    do update set count = api_usage_counters.count + 1, updated_at = now()
  returning count into new_count;

  return new_count <= p_limit;
end;
$$;
