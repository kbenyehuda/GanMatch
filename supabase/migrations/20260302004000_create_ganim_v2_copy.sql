-- Create a new canonical table (ganim_v2) with GanMatch categories/pricing,
-- and copy existing data from public.ganim into it.
-- This does NOT modify or delete the original public.ganim table.

-- =============================================================================
-- ENUMS (idempotent)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gan_category') THEN
    CREATE TYPE public.gan_category AS ENUM ('UNSPECIFIED', 'MAON_SYMBOL', 'PRIVATE_GAN', 'MISHPACHTON', 'MUNICIPAL_GAN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'private_supervision_status') THEN
    CREATE TYPE public.private_supervision_status AS ENUM ('UNKNOWN', 'SUPERVISED', 'NOT_SUPERVISED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mishpachton_affiliation') THEN
    CREATE TYPE public.mishpachton_affiliation AS ENUM ('UNKNOWN', 'PRIVATE', 'TAMAT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'municipal_grade') THEN
    CREATE TYPE public.municipal_grade AS ENUM ('UNKNOWN', 'TTAH', 'TAH', 'HOVA');
  END IF;
END $$;

-- =============================================================================
-- TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ganim_v2 (
  id UUID PRIMARY KEY,

  -- Core identifiers
  name_he TEXT NOT NULL,
  name_en TEXT,

  -- Location
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT,
  city TEXT,

  -- GanMatch categories
  category public.gan_category NOT NULL DEFAULT 'UNSPECIFIED',
  maon_symbol_code TEXT,
  private_supervision public.private_supervision_status,
  mishpachton_affiliation public.mishpachton_affiliation,
  municipal_grade public.municipal_grade,

  -- Ops
  has_cctv BOOLEAN NOT NULL DEFAULT FALSE,
  cctv_streamed_online BOOLEAN,

  -- Pricing & ages
  monthly_price_nis NUMERIC(10,2),
  min_age_months INT,
  max_age_months INT,
  price_notes TEXT,

  -- Flexible metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Verification / suggestion (keep parity with current schema if present)
  is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  suggested_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  suggested_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ganim_v2_category_subfields_check CHECK (
    (category <> 'MAON_SYMBOL' OR maon_symbol_code IS NOT NULL)
    AND (category = 'MAON_SYMBOL' OR maon_symbol_code IS NULL)
    AND (category = 'PRIVATE_GAN' OR private_supervision IS NULL)
    AND (category = 'MISHPACHTON' OR mishpachton_affiliation IS NULL)
    AND (category = 'MUNICIPAL_GAN' OR municipal_grade IS NULL)
  ),
  CONSTRAINT ganim_v2_age_months_check CHECK (
    (min_age_months IS NULL OR (min_age_months >= 0 AND min_age_months <= 96))
    AND (max_age_months IS NULL OR (max_age_months >= 0 AND max_age_months <= 96))
    AND (min_age_months IS NULL OR max_age_months IS NULL OR min_age_months <= max_age_months)
  ),
  CONSTRAINT ganim_v2_monthly_price_check CHECK (
    monthly_price_nis IS NULL OR (monthly_price_nis >= 0 AND monthly_price_nis <= 30000)
  )
);

CREATE INDEX IF NOT EXISTS idx_ganim_v2_location ON public.ganim_v2 USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_city ON public.ganim_v2 (city);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_category ON public.ganim_v2 (category);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_metadata ON public.ganim_v2 USING GIN (metadata);

-- =============================================================================
-- COPY DATA (idempotent upsert)
-- =============================================================================
INSERT INTO public.ganim_v2 (
  id,
  name_he,
  name_en,
  location,
  address,
  city,
  category,
  has_cctv,
  cctv_streamed_online,
  metadata,
  is_verified,
  suggested_by,
  suggested_at,
  created_at,
  updated_at
)
SELECT
  g.id,
  g.name_he,
  g.name_en,
  g.location,
  g.address,
  g.city,
  'UNSPECIFIED'::public.gan_category,
  COALESCE(g.has_cctv, FALSE),
  g.cctv_streamed_online,
  -- Preserve legacy columns into metadata for reference (do not overwrite if already exists)
  (
    CASE
      WHEN NOT (g.metadata ? 'legacy_gov_type') THEN
        g.metadata || jsonb_build_object('legacy_gov_type', g.type)
      ELSE g.metadata
    END
  ) || (
    CASE
      WHEN NOT (g.metadata ? 'legacy_gov_license_status') THEN
        jsonb_build_object('legacy_gov_license_status', g.license_status)
      ELSE '{}'::jsonb
    END
  ),
  COALESCE(g.is_verified, TRUE),
  g.suggested_by,
  g.suggested_at,
  COALESCE(g.created_at, NOW()),
  COALESCE(g.updated_at, NOW())
FROM public.ganim g
ON CONFLICT (id) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  name_en = EXCLUDED.name_en,
  location = EXCLUDED.location,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  has_cctv = EXCLUDED.has_cctv,
  cctv_streamed_online = EXCLUDED.cctv_streamed_online,
  metadata = EXCLUDED.metadata,
  is_verified = EXCLUDED.is_verified,
  suggested_by = EXCLUDED.suggested_by,
  suggested_at = EXCLUDED.suggested_at,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

-- =============================================================================
-- RLS (match original: public read)
-- =============================================================================
ALTER TABLE public.ganim_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ganim_v2_public_read ON public.ganim_v2;
CREATE POLICY ganim_v2_public_read ON public.ganim_v2 FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';

