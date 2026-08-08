-- Simplifies increment_api_usage() to just count calls (provider, period) ->
-- new count. The budget/limit decision moved out of SQL and into
-- src/lib/api-usage.ts, which now reads dollar budgets + free-tier sizes +
-- enabled/disabled flags from config/api-usage-limits.json (a human-edited
-- file), rather than a single hardcoded call-count limit passed in from
-- each call site.

drop function if exists increment_api_usage(text, text, integer);

create or replace function increment_api_usage(p_provider text, p_period text)
returns integer
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

  return new_count;
end;
$$;
