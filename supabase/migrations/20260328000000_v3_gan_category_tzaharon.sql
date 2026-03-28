-- V3: Introduce Tzaharon category types, fix constraint + unique index, backfill gov rows.
--
-- Context: All rows imported from data.gov.il were previously stored as MAON_SYMBOL
-- regardless of their real type. The actual type is in metadata->'gov'->>'maon_type_code':
--   0 = מעון סמל    → stays MAON_SYMBOL (correct)
--   1 = משפחתון סמל → reclassified to MISHPACHTON (affiliation = TAMAT)
--   2 = צהרון עירוני → reclassified to TZAHARON_MUNICIPAL
--
-- All 3 types have a gov-issued symbol code (maon_symbol_code), so we:
--   1. Add 3 new enum values (committed separately — Postgres requires this)
--   2. Relax the CHECK constraint to allow maon_symbol_code on all 3 gov-sourced types
--   3. Extend the unique index to deduplicate all 3 gov-sourced types by symbol code
--   4. Backfill existing rows
--
-- IMPORTANT: Steps 1 must be committed before steps 2–4 can reference the new values.
-- When applying manually via the Supabase SQL editor, run step 1 first, then step 2–4.

-- =============================================================================
-- Step 1: Add new enum values
-- NOTE: Run this block alone first, then run the rest below.
-- =============================================================================
ALTER TYPE public.gan_category ADD VALUE IF NOT EXISTS 'TZAHARON_MUNICIPAL';
ALTER TYPE public.gan_category ADD VALUE IF NOT EXISTS 'TZAHARON_PRIVATE_SUPERVISED';
ALTER TYPE public.gan_category ADD VALUE IF NOT EXISTS 'TZAHARON_PRIVATE_UNSUPERVISED';

-- =============================================================================
-- Steps 2–5 below require the enum values above to be committed first.
-- If applying via Supabase SQL editor: run the ALTER TYPE block above,
-- then run everything below in a second execution.
-- =============================================================================

-- Step 2: Relax the CHECK constraint
ALTER TABLE public.ganim_v2
  DROP CONSTRAINT ganim_v2_category_subfields_check,
  ADD CONSTRAINT ganim_v2_category_subfields_check CHECK (
    (category <> 'MAON_SYMBOL' OR maon_symbol_code IS NOT NULL)
    AND (category IN ('MAON_SYMBOL', 'MISHPACHTON', 'TZAHARON_MUNICIPAL') OR maon_symbol_code IS NULL)
    AND (category = 'PRIVATE_GAN' OR private_supervision IS NULL)
    AND (category = 'MISHPACHTON' OR mishpachton_affiliation IS NULL)
    AND (category = 'MUNICIPAL_GAN' OR municipal_grade IS NULL)
  );

-- Step 3: Restore the MAON_SYMBOL-only unique index.
-- Note: MISHPACHTON and TZAHARON_MUNICIPAL rows from gov imports deduplicate via
-- ON CONFLICT (id) using deterministic UUIDs, so a wider index is not required.
DROP INDEX IF EXISTS uniq_ganim_v2_maon_symbol_code;

CREATE UNIQUE INDEX uniq_ganim_v2_maon_symbol_code
ON public.ganim_v2 (maon_symbol_code)
WHERE category = 'MAON_SYMBOL'::public.gan_category
  AND maon_symbol_code IS NOT NULL;

-- Step 4: Backfill — reclassify משפחתון סמל (maon_type_code = 1)
UPDATE public.ganim_v2
SET
  category = 'MISHPACHTON',
  mishpachton_affiliation = 'TAMAT'
WHERE category = 'MAON_SYMBOL'
  AND metadata->'gov'->>'maon_type_code' = '1';

-- Step 5: Backfill — reclassify צהרון עירוני (maon_type_code = 2)
UPDATE public.ganim_v2
SET category = 'TZAHARON_MUNICIPAL'
WHERE category = 'MAON_SYMBOL'
  AND metadata->'gov'->>'maon_type_code' = '2';

NOTIFY pgrst, 'reload schema';
