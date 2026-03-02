-- Step A (deterministic): backfill ganim_v2 typed columns from existing metadata/text hints.
-- No AI. Conservative rules: only set when we are confident.

-- =============================================================================
-- 1) CCTV columns from metadata.cctv_access
-- =============================================================================
UPDATE public.ganim_v2
SET
  has_cctv = CASE
    WHEN (metadata->>'cctv_access') IN ('online', 'exceptional') THEN TRUE
    WHEN (metadata->>'cctv_access') = 'none' THEN FALSE
    ELSE has_cctv
  END,
  cctv_streamed_online = CASE
    WHEN (metadata->>'cctv_access') = 'online' THEN TRUE
    WHEN (metadata->>'cctv_access') = 'exceptional' THEN FALSE
    WHEN (metadata->>'cctv_access') = 'none' THEN NULL
    ELSE cctv_streamed_online
  END
WHERE metadata ? 'cctv_access';

-- =============================================================================
-- 2) Extract "סמל מעון" code when present
-- =============================================================================
WITH extracted AS (
  SELECT
    id,
    substring(
      coalesce(metadata->>'raw_address', '') || ' ' || coalesce(address, '') || ' ' || coalesce(metadata->>'suggested_type', '')
      FROM '(?i)סמל\s*מעון\s*:?\s*([0-9]{3,})'
    ) AS code
  FROM public.ganim_v2
  WHERE maon_symbol_code IS NULL
    AND (
      coalesce(metadata->>'raw_address', '') || ' ' || coalesce(address, '') || ' ' || coalesce(metadata->>'suggested_type', '')
    ) ~* 'סמל\s*מעון'
)
UPDATE public.ganim_v2 g
SET
  maon_symbol_code = e.code,
  category = 'MAON_SYMBOL'::public.gan_category
FROM extracted e
WHERE g.id = e.id
  AND e.code IS NOT NULL;

-- =============================================================================
-- 3) Infer category (only for rows still UNSPECIFIED)
-- Order matters: MAON_SYMBOL > MISHPACHTON > MUNICIPAL_GAN > PRIVATE_GAN
-- =============================================================================
WITH src AS (
  SELECT
    id,
    category,
    maon_symbol_code,
    name_he,
    city,
    metadata,
    (coalesce(metadata->>'suggested_type', '') || ' ' ||
     coalesce(metadata->>'org', '') || ' ' ||
     coalesce(metadata->>'raw_address', '') || ' ' ||
     coalesce(address, '')
    ) AS t
  FROM public.ganim_v2
)
UPDATE public.ganim_v2 g
SET category = CASE
  WHEN s.maon_symbol_code IS NOT NULL THEN 'MAON_SYMBOL'::public.gan_category
  WHEN s.name_he ILIKE '%משפחתון%' OR s.t ~* 'משפחתון' THEN 'MISHPACHTON'::public.gan_category
  WHEN s.t ~* '(גן\s*עירוני|גן\s*עירייה|עירוני|עיריה|עיריית|עיריית\s+\S+)' THEN 'MUNICIPAL_GAN'::public.gan_category
  WHEN s.t ~* '(פרטי|גן\s*פרטי)' THEN 'PRIVATE_GAN'::public.gan_category
  ELSE g.category
END
FROM src s
WHERE g.id = s.id
  AND g.category = 'UNSPECIFIED'::public.gan_category;

-- =============================================================================
-- 4) Dependent fields by category (conservative)
-- =============================================================================
-- PRIVATE_GAN: infer supervision from text (only if currently null)
UPDATE public.ganim_v2
SET private_supervision = CASE
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(לא\s*מפוקח|ללא\s*פיקוח)' THEN 'NOT_SUPERVISED'::public.private_supervision_status
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(מפוקח|פיקוח)' THEN 'SUPERVISED'::public.private_supervision_status
  ELSE 'UNKNOWN'::public.private_supervision_status
END
WHERE category = 'PRIVATE_GAN'::public.gan_category
  AND private_supervision IS NULL;

-- MISHPACHTON: infer affiliation
UPDATE public.ganim_v2
SET mishpachton_affiliation = CASE
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(תמ\s*["״]?ת|תמת)' THEN 'TAMAT'::public.mishpachton_affiliation
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(פרטי)' THEN 'PRIVATE'::public.mishpachton_affiliation
  ELSE 'UNKNOWN'::public.mishpachton_affiliation
END
WHERE category = 'MISHPACHTON'::public.gan_category
  AND mishpachton_affiliation IS NULL;

-- MUNICIPAL_GAN: infer grade
UPDATE public.ganim_v2
SET municipal_grade = CASE
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(טט\s*["״]?ח|טט״ח|טט"ח)' THEN 'TTAH'::public.municipal_grade
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(ט\s*["״]?ח|ט״ח|ט"ח)' THEN 'TAH'::public.municipal_grade
  WHEN (
    coalesce(metadata->>'suggested_type', '') || ' ' ||
    coalesce(metadata->>'raw_address', '') || ' ' ||
    coalesce(address, '')
  ) ~* '(חובה)' THEN 'HOVA'::public.municipal_grade
  ELSE 'UNKNOWN'::public.municipal_grade
END
WHERE category = 'MUNICIPAL_GAN'::public.gan_category
  AND municipal_grade IS NULL;

-- Ensure MISHPACHTON/PRIVATE/MUNICIPAL dependent enums are not null once category is set
UPDATE public.ganim_v2
SET private_supervision = COALESCE(private_supervision, 'UNKNOWN'::public.private_supervision_status)
WHERE category = 'PRIVATE_GAN'::public.gan_category;

UPDATE public.ganim_v2
SET mishpachton_affiliation = COALESCE(mishpachton_affiliation, 'UNKNOWN'::public.mishpachton_affiliation)
WHERE category = 'MISHPACHTON'::public.gan_category;

UPDATE public.ganim_v2
SET municipal_grade = COALESCE(municipal_grade, 'UNKNOWN'::public.municipal_grade)
WHERE category = 'MUNICIPAL_GAN'::public.gan_category;

NOTIFY pgrst, 'reload schema';

