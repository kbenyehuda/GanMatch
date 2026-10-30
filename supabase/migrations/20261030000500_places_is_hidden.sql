-- Private people (babysitters, caregivers) are not shown until they agree to be listed
-- (user, 2026-10-30; LEGAL_REVIEW.md M4). Like place_reviews.is_hidden: the row is kept,
-- the public API never sees it, and setting the flag back to false restores it.

alter table public.places add column if not exists is_hidden boolean not null default false;

drop policy if exists places_public_read on public.places;
create policy places_public_read on public.places
  for select using (not is_hidden);

-- Recommendations about a hidden place are hidden too (they name the person).
-- `exists ... and not p.is_hidden` rather than `not exists ... and p.is_hidden`: under RLS a
-- hidden place is invisible, so the negative form would let its reviews through.
drop policy if exists place_reviews_select on public.place_reviews;
create policy place_reviews_select on public.place_reviews
  for select using (
    not is_hidden
    and exists (select 1 from public.places p where p.id = place_reviews.place_id and not p.is_hidden)
  );

-- These two are security definer, so RLS doesn't apply inside them; they filter themselves.
-- (get_places_in_bbox runs as the caller, so RLS covers it.)
create or replace function public.get_all_places(p_limit integer default 500, p_categories text[] default null::text[])
 returns table(id uuid, name text, place_category place_category, address text, neighborhood neighborhood_givatayim, phone text[], website text, hours text, description text, kosher kosher_status, price_range smallint, hmo text[], photos text[], attributes jsonb, avg_rating real, rec_count integer, is_verified boolean, source text, lat double precision, lon double precision)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
  begin
    return query
    select
      p.id, p.name, p.place_category, p.address, p.neighborhood,
      p.phone, p.website, p.hours, p.description, p.kosher, p.price_range,
      p.hmo, p.photos, p.attributes, p.avg_rating, p.rec_count, p.is_verified, p.source,
      st_y(p.location::geometry)::double precision as lat,
      st_x(p.location::geometry)::double precision as lon
    from public.places p
    where not p.is_hidden
      and (p_categories is null or p.place_category::text = any(p_categories))
    order by p.avg_rating desc nulls last
    limit p_limit;
  end;
$function$;

create or replace function public.search_places(p_query text, p_limit integer default 20, p_categories text[] default null::text[])
 returns table(id uuid, name text, place_category place_category, address text, neighborhood neighborhood_givatayim, phone text[], website text, hours text, description text, kosher kosher_status, price_range smallint, hmo text[], photos text[], attributes jsonb, avg_rating real, rec_count integer, is_verified boolean, source text, lat double precision, lon double precision)
 language plpgsql
 stable security definer
as $function$
begin
  return query
  select
    p.id, p.name, p.place_category, p.address, p.neighborhood,
    p.phone, p.website, p.hours, p.description, p.kosher, p.price_range,
    p.hmo, p.photos, p.attributes, p.avg_rating, p.rec_count, p.is_verified, p.source,
    st_y(p.location::geometry)::double precision as lat,
    st_x(p.location::geometry)::double precision as lon
  from public.places p
  where not p.is_hidden
    and (
      p.name        ilike '%' || p_query || '%'
      or p.address  ilike '%' || p_query || '%'
      or p.description ilike '%' || p_query || '%'
    )
    and (p_categories is null or p.place_category::text = any(p_categories))
  order by
    -- Exact name prefix first, then partial, then by rating
    case
      when p.name ilike p_query || '%' then 0
      when p.name ilike '%' || p_query || '%' then 1
      else 2
    end,
    p.avg_rating desc nulls last
  limit p_limit;
end;
$function$;

-- The 9 private caregivers listed today: the 8 בייביסיטר entries and שביט לוי (מטפלת)
update public.places set is_hidden = true where id in (
  'cbd41166-9bb8-4134-8e3c-bfad6a519255', -- איריס
  'b872e5f9-c650-4d7b-8056-8d898509e8ad', -- אסתר קוסיוף
  'bf9f82a6-fc07-4f4d-b5b3-cca0243c050f', -- אתי (מטפלת)
  'ac21d1c5-a657-4ea7-addf-7fa186516994', -- חנה (מטפלת)
  'c63c0e80-d852-46c7-818b-2b2c5bbff989', -- יובל קרמר
  '42060c4e-f5d4-444e-a4e4-8f953e76c1cd', -- לילי
  '6ca6509d-fd5c-4aa8-a503-40ff608a80a3', -- נאוית (מטפלת)
  'c71aa166-ae36-471a-bf35-c0f8fbeb1cd9', -- ספיר (בייביסיטר)
  '55ebb99d-e643-4c6e-ad02-37fce2f578f6'  -- שביט לוי (מטפלת)
);
