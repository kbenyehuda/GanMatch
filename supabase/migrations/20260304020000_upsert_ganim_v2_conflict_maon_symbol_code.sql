-- Ensure MAON_SYMBOL rows are de-duplicated by maon_symbol_code (not by id).
-- This prevents duplicates when historical rows used non-deterministic UUIDs.
--
-- Safe/idempotent:
-- - Creates a partial unique index for MAON_SYMBOL only
-- - Updates the upsert RPC to use ON CONFLICT (maon_symbol_code) for MAON_SYMBOL

-- =============================================================================
-- UNIQUE KEY: MAON_SYMBOL(maon_symbol_code)
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ganim_v2_maon_symbol_code
ON public.ganim_v2 (maon_symbol_code)
WHERE category = 'MAON_SYMBOL'::public.gan_category AND maon_symbol_code IS NOT NULL;

-- =============================================================================
-- RPC: upsert_ganim_v2 (MAON_SYMBOL conflicts on maon_symbol_code)
-- =============================================================================
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
  p_is_fallback BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_cat public.gan_category;
BEGIN
  -- Validate + cast category
  BEGIN
    v_cat := p_category::public.gan_category;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'p_id is required';
  END IF;
  IF p_name_he IS NULL OR btrim(p_name_he) = '' THEN
    RAISE EXCEPTION 'p_name_he is required';
  END IF;
  IF p_lon IS NULL OR p_lat IS NULL THEN
    RAISE EXCEPTION 'p_lon/p_lat are required';
  END IF;

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
      -- Preserve existing metadata, but allow the incoming payload to overwrite keys.
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

  -- Default behavior: upsert by deterministic id (other categories).
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
  ON CONFLICT (id) DO UPDATE SET
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
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ganim_v2(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ganim_v2(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';

