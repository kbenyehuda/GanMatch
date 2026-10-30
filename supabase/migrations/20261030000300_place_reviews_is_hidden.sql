-- Negative recommendations (rating 1–2) are not displayed for now (user, 2026-10-30), pending legal
-- advice. They stay attached to their place with is_hidden = true, so each can be restored later.
-- The public API never sees hidden rows (RLS), and a place's rating and count skip them.

alter table public.place_reviews add column if not exists is_hidden boolean not null default false;

drop policy if exists place_reviews_select on public.place_reviews;
create policy place_reviews_select on public.place_reviews
  for select using (not is_hidden);

create or replace function public.update_place_stats()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    update public.places set
      avg_rating = (select avg(rating)::float4 from public.place_reviews where place_id = old.place_id and not is_hidden),
      rec_count  = (select count(*)::int       from public.place_reviews where place_id = old.place_id and not is_hidden),
      updated_at = now()
    where id = old.place_id;
    return old;
  end if;

  -- On UPDATE where place_id changed, the old place also loses a review.
  if tg_op = 'UPDATE' and old.place_id is distinct from new.place_id then
    update public.places set
      avg_rating = (select avg(rating)::float4 from public.place_reviews where place_id = old.place_id and not is_hidden),
      rec_count  = (select count(*)::int       from public.place_reviews where place_id = old.place_id and not is_hidden),
      updated_at = now()
    where id = old.place_id;
  end if;

  update public.places set
    avg_rating = (select avg(rating)::float4 from public.place_reviews where place_id = new.place_id and not is_hidden),
    rec_count  = (select count(*)::int       from public.place_reviews where place_id = new.place_id and not is_hidden),
    updated_at = now()
  where id = new.place_id;

  return new;
end;
$function$;

-- Hide the existing negative recommendations (the trigger recalculates each place's rating and count)
update public.place_reviews set is_hidden = true where rating <= 2 and not is_hidden;
