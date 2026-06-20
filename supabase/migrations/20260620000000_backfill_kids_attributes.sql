-- Restore gan attributes that the ganim_v2 -> places migration
-- (20260515000000_create_places_table.sql) left out of places.attributes.
-- Source data is untouched in ganim_v2 — this only backfills the JSONB.

UPDATE public.places p
SET attributes = p.attributes || jsonb_strip_nulls(jsonb_build_object(
  'has_mamad',            g.has_mamad,
  'has_cctv',             g.has_cctv,
  'cctv_streamed_online', g.cctv_streamed_online,
  'kosher_certifier',     g.kosher_certifier,
  'staff_child_ratio',    g.staff_child_ratio,
  'first_aid_trained',    g.first_aid_trained,
  'languages_spoken',     to_jsonb(g.languages_spoken),
  'vegan_friendly',       g.vegan_friendly,
  'vegetarian_friendly',  g.vegetarian_friendly,
  'meat_served',          g.meat_served,
  'allergy_friendly',     g.allergy_friendly,
  'chugim_types',         to_jsonb(g.chugim_types)
))
FROM public.ganim_v2 g
WHERE p.place_category = 'kids'
  AND p.attributes->>'ganmatch_id' = g.id::TEXT;

NOTIFY pgrst, 'reload schema';
