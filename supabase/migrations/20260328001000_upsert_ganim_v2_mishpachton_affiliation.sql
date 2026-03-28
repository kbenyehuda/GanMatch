-- V3: Add p_mishpachton_affiliation to upsert_ganim_v2.
--
-- Context: After the v3 category backfill (20260328000000), the gov import script
-- will be updated to call upsert_ganim_v2 with category='MISHPACHTON' for
-- maon_type_code=1 rows. Without this migration, those rows would be inserted with
-- the correct category but a missing mishpachton_affiliation (should always be TAMAT
-- for gov-imported type-1 rows).
--
-- The new parameter defaults to NULL so all existing callers are unaffected.

-- Drop the old function signature before replacing with the new one.
-- (CREATE OR REPLACE with a different parameter list creates a new overload,
-- leaving the old signature in place — we want to replace, not overload.)
DROP FUNCTION IF EXISTS public.upsert_ganim_v2(
  UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.upsert_ganim_v2(
  p_id UUID,
  p_name_he TEXT,
  p_lon DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'UNSPECIFIED',
  p_maon_symbol_code TEXT DEFAULT NULL,
  p_is_verified BOOLEAN DEFAULT TRUE,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_is_fallback BOOLEAN DEFAULT FALSE,
  p_mishpachton_affiliation TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_cat public.gan_category;
  v_mishpachton_affiliation public.mishpachton_affiliation;
BEGIN
  -- Validate + cast category
  BEGIN
    v_cat := p_category::public.gan_category;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END;

  -- Validate + cast mishpachton_affiliation (if provided)
  IF p_mishpachton_affiliation IS NOT NULL THEN
    BEGIN
      v_mishpachton_affiliation := p_mishpachton_affiliation::public.mishpachton_affiliation;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid mishpachton_affiliation: %', p_mishpachton_affiliation;
    END;
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'p_id is required';
  END IF;
  IF p_name_he IS NULL OR btrim(p_name_he) = '' THEN
    RAISE EXCEPTION 'p_name_he is required';
  END IF;
  IF p_lon IS NULL OR p_lat IS NULL THEN
    RAISE EXCEPTION 'p_lon/p_lat are required';
  END IF;

  -- MAON_SYMBOL: deduplicate by maon_symbol_code (not id)
  IF v_cat = 'MAON_SYMBOL'::public.gan_category THEN
    IF p_maon_symbol_code IS NULL OR btrim(p_maon_symbol_code) = '' THEN
      RAISE EXCEPTION 'p_maon_symbol_code is required for category=MAON_SYMBOL';
    END IF;

    INSERT INTO public.ganim_v2 (
      id,
      name_he,
      address,
      city,
      category,
      maon_symbol_code,
      metadata,
      location,
      is_verified,
      updated_at
    ) VALUES (
      p_id,
      p_name_he,
      p_address,
      p_city,
      v_cat,
      p_maon_symbol_code,
      COALESCE(p_metadata, '{}'::jsonb),
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      COALESCE(p_is_verified, TRUE),
      NOW()
    )
    ON CONFLICT (maon_symbol_code)
      WHERE category = 'MAON_SYMBOL'::public.gan_category
    DO UPDATE SET
      name_he = EXCLUDED.name_he,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      category = EXCLUDED.category,
      maon_symbol_code = EXCLUDED.maon_symbol_code,
      metadata = public.ganim_v2.metadata || EXCLUDED.metadata,
      location = CASE
        WHEN p_is_fallback THEN public.ganim_v2.location
        ELSE EXCLUDED.location
      END,
      is_verified = EXCLUDED.is_verified,
      updated_at = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  -- All other categories (including MISHPACHTON, TZAHARON_MUNICIPAL): upsert by id.
  -- Gov import generates deterministic UUIDs from the semel code, so
  -- ON CONFLICT (id) reliably deduplicates re-imports without a symbol-code index.
  INSERT INTO public.ganim_v2 (
    id,
    name_he,
    address,
    city,
    category,
    maon_symbol_code,
    mishpachton_affiliation,
    metadata,
    location,
    is_verified,
    updated_at
  ) VALUES (
    p_id,
    p_name_he,
    p_address,
    p_city,
    v_cat,
    p_maon_symbol_code,
    v_mishpachton_affiliation,
    COALESCE(p_metadata, '{}'::jsonb),
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    COALESCE(p_is_verified, TRUE),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    name_he = EXCLUDED.name_he,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    category = EXCLUDED.category,
    maon_symbol_code = EXCLUDED.maon_symbol_code,
    mishpachton_affiliation = EXCLUDED.mishpachton_affiliation,
    metadata = public.ganim_v2.metadata || EXCLUDED.metadata,
    location = CASE
      WHEN p_is_fallback THEN public.ganim_v2.location
      ELSE EXCLUDED.location
    END,
    is_verified = EXCLUDED.is_verified,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ganim_v2(
  UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ganim_v2(
  UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN, TEXT
) TO service_role;

NOTIFY pgrst, 'reload schema';
