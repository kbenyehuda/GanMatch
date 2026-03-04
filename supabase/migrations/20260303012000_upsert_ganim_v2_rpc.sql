-- Upsert into ganim_v2 (canonical table) from ingestion scripts.
-- Designed for safe re-runs:
-- - Deterministic IDs from external sources (e.g. gov SEMEL_MAON)
-- - Optional "fallback" coords should not overwrite existing precise coords
--
-- SECURITY:
-- - Exposed to service_role only (server-side / scripts)
--
-- =============================================================================
-- Ensure enum exists (idempotent)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gan_category') THEN
    CREATE TYPE public.gan_category AS ENUM ('UNSPECIFIED', 'MAON_SYMBOL', 'PRIVATE_GAN', 'MISHPACHTON', 'MUNICIPAL_GAN');
  END IF;
END $$;

-- =============================================================================
-- RPC
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
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ganim_v2(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_ganim_v2(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB, BOOLEAN) TO service_role;

NOTIFY pgrst, 'reload schema';

