-- ROLLBACK for 20260515000000_create_places_table.sql
--
-- Run this in the Supabase SQL editor to undo the Give My Time migration.
-- This removes ONLY the new objects added by that migration.
-- ganim_v2, confirmed_reviews, user_inputs, and all other existing tables
-- are NOT touched by either the migration or this rollback.
--
-- Safe to run even if the migration was only partially applied.

-- RPC
DROP FUNCTION IF EXISTS public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
);

-- Trigger + function (must drop trigger before function)
DROP TRIGGER  IF EXISTS trg_place_stats         ON public.place_reviews;
DROP FUNCTION IF EXISTS public.update_place_stats();

-- Tables (place_reviews first — it has an FK to places)
DROP TABLE IF EXISTS public.place_reviews;
DROP TABLE IF EXISTS public.places;

-- Enums (only safe to drop after tables are gone)
DROP TYPE IF EXISTS public.neighborhood_givatayim;
DROP TYPE IF EXISTS public.place_category;

NOTIFY pgrst, 'reload schema';
