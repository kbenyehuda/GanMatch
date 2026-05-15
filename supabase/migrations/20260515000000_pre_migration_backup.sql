-- PRE-MIGRATION BACKUP — run this BEFORE 20260515000000_create_places_table.sql
--
-- Creates snapshot copies of the key GanMatch tables, suffixed with _bak_20260515.
-- These are plain tables (no RLS, no indexes, no FKs) — read-only safety copies.
-- They do NOT affect the live app at all.
--
-- To restore a table from backup:
--   INSERT INTO public.ganim_v2 SELECT * FROM public.ganim_v2_bak_20260515
--   ON CONFLICT (id) DO NOTHING;
--   (repeat for other tables as needed)
--
-- To drop backups once you're confident everything is fine:
--   DROP TABLE IF EXISTS public.ganim_v2_bak_20260515;
--   DROP TABLE IF EXISTS public.confirmed_reviews_bak_20260515;
--   DROP TABLE IF EXISTS public.user_inputs_bak_20260515;
--   DROP TABLE IF EXISTS public.user_access_entitlements_bak_20260515;

CREATE TABLE IF NOT EXISTS public.ganim_v2_bak_20260515
  AS SELECT * FROM public.ganim_v2;

CREATE TABLE IF NOT EXISTS public.confirmed_reviews_bak_20260515
  AS SELECT * FROM public.confirmed_reviews;

CREATE TABLE IF NOT EXISTS public.user_inputs_bak_20260515
  AS SELECT * FROM public.user_inputs;

CREATE TABLE IF NOT EXISTS public.user_access_entitlements_bak_20260515
  AS SELECT * FROM public.user_access_entitlements;

-- Quick sanity check: print row counts
DO $$
DECLARE
  r_ganim       INT;
  r_reviews     INT;
  r_inputs      INT;
  r_entitlements INT;
BEGIN
  SELECT COUNT(*) INTO r_ganim       FROM public.ganim_v2_bak_20260515;
  SELECT COUNT(*) INTO r_reviews     FROM public.confirmed_reviews_bak_20260515;
  SELECT COUNT(*) INTO r_inputs      FROM public.user_inputs_bak_20260515;
  SELECT COUNT(*) INTO r_entitlements FROM public.user_access_entitlements_bak_20260515;
  RAISE NOTICE 'Backup row counts → ganim_v2: %, confirmed_reviews: %, user_inputs: %, entitlements: %',
    r_ganim, r_reviews, r_inputs, r_entitlements;
END $$;
