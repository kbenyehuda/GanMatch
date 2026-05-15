-- Give My Time pivot: create the places table, place_reviews, bbox RPC,
-- and migrate ganim_v2 rows in as category='kids'.

-- =============================================================================
-- ENUMS
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'place_category') THEN
    CREATE TYPE public.place_category AS ENUM (
      'doctor',
      'cafe',
      'kids',
      'wellness',
      'attraction',
      'food'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'neighborhood_givatayim') THEN
    CREATE TYPE public.neighborhood_givatayim AS ENUM (
      'BOROCHOV',
      'RAMBAM',
      'SIRKIN',
      'ARLOZOROV',
      'GIVAT_RAMBAM'
    );
  END IF;
END $$;

-- =============================================================================
-- TABLE: places
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core display
  name TEXT NOT NULL,
  place_category public.place_category NOT NULL,

  -- Location
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address TEXT,
  neighborhood public.neighborhood_givatayim,

  -- Contact & hours (display only, not filtered)
  phone TEXT[],
  website TEXT,
  hours TEXT,

  -- Free text; feeds LLM semantic search
  description TEXT,

  -- Filter columns (one UI chip each)
  -- kosher reuses the existing kosher_status enum (CERTIFIED / NOT_CERTIFIED / UNKNOWN)
  kosher public.kosher_status,
  -- 1 = budget, 2 = mid, 3 = expensive
  price_range SMALLINT CHECK (price_range BETWEEN 1 AND 3),
  -- doctor HMO affiliations: 'maccabi' | 'clalit' | 'meuhedet' | 'leumit'
  hmo TEXT[],

  -- Media (Supabase Storage public URLs)
  photos TEXT[] NOT NULL DEFAULT '{}',

  -- Category-specific structured data:
  --   kids:       { age_min, age_max, meal_type, friday_schedule, has_outdoor_space, vacancy_status, monthly_price_nis, maon_symbol_code, ganmatch_id }
  --   doctor:     { specialty }
  --   wellness:   { specialty, gender_restriction }
  --   attraction: { age_min, age_max, indoor_outdoor }
  attributes JSONB NOT NULL DEFAULT '{}',

  -- Stats; maintained by trigger on place_reviews
  avg_rating FLOAT4,
  rec_count INT NOT NULL DEFAULT 0,

  -- Provenance
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'community' for new contributions, 'migrated_ganmatch' for rows from ganim_v2
  source TEXT NOT NULL DEFAULT 'community',
  suggested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_places_location      ON public.places USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_places_category      ON public.places (place_category);
CREATE INDEX IF NOT EXISTS idx_places_neighborhood  ON public.places (neighborhood);
CREATE INDEX IF NOT EXISTS idx_places_kosher        ON public.places (kosher);
CREATE INDEX IF NOT EXISTS idx_places_price_range   ON public.places (price_range);
CREATE INDEX IF NOT EXISTS idx_places_hmo           ON public.places USING GIN (hmo);
CREATE INDEX IF NOT EXISTS idx_places_attributes    ON public.places USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_places_avg_rating    ON public.places (avg_rating DESC NULLS LAST);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS places_public_read        ON public.places;
DROP POLICY IF EXISTS places_insert_auth        ON public.places;
DROP POLICY IF EXISTS places_update_service     ON public.places;

CREATE POLICY places_public_read    ON public.places FOR SELECT USING (true);
CREATE POLICY places_insert_auth    ON public.places FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY places_update_service ON public.places FOR UPDATE USING (auth.role() = 'service_role');

-- =============================================================================
-- TABLE: place_reviews
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.place_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,

  rating NUMERIC(2,1) NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT,
  photos TEXT[] DEFAULT '{}',

  is_anonymous  BOOLEAN NOT NULL DEFAULT TRUE,
  allow_contact BOOLEAN NOT NULL DEFAULT TRUE,
  reviewer_public_name          TEXT,
  reviewer_public_email_masked  TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS idx_place_reviews_place_id ON public.place_reviews (place_id);
CREATE INDEX IF NOT EXISTS idx_place_reviews_user_id  ON public.place_reviews (user_id);

ALTER TABLE public.place_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS place_reviews_select         ON public.place_reviews;
DROP POLICY IF EXISTS place_reviews_insert_auth    ON public.place_reviews;

CREATE POLICY place_reviews_select      ON public.place_reviews FOR SELECT USING (true);
CREATE POLICY place_reviews_insert_auth ON public.place_reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- TRIGGER: keep places.avg_rating + rec_count in sync with place_reviews
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_place_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_place_id UUID;
BEGIN
  v_place_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.place_id ELSE NEW.place_id END;

  UPDATE public.places
  SET
    avg_rating = (SELECT AVG(rating)::FLOAT4 FROM public.place_reviews WHERE place_id = v_place_id),
    rec_count  = (SELECT COUNT(*)::INT       FROM public.place_reviews WHERE place_id = v_place_id),
    updated_at = NOW()
  WHERE id = v_place_id;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_place_stats ON public.place_reviews;
CREATE TRIGGER trg_place_stats
  AFTER INSERT OR DELETE ON public.place_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_place_stats();

-- =============================================================================
-- RPC: get_places_in_bbox
-- Mirrors the existing get_ganim_in_bbox pattern.
-- p_categories: optional filter e.g. ARRAY['doctor','cafe'] — NULL means all.
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
);

CREATE OR REPLACE FUNCTION public.get_places_in_bbox(
  min_lon       DOUBLE PRECISION,
  min_lat       DOUBLE PRECISION,
  max_lon       DOUBLE PRECISION,
  max_lat       DOUBLE PRECISION,
  p_limit       INT     DEFAULT 200,
  p_categories  TEXT[]  DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  name            TEXT,
  place_category  public.place_category,
  address         TEXT,
  neighborhood    public.neighborhood_givatayim,
  phone           TEXT[],
  website         TEXT,
  hours           TEXT,
  description     TEXT,
  kosher          public.kosher_status,
  price_range     SMALLINT,
  hmo             TEXT[],
  photos          TEXT[],
  attributes      JSONB,
  avg_rating      FLOAT4,
  rec_count       INT,
  is_verified     BOOLEAN,
  source          TEXT,
  lat             DOUBLE PRECISION,
  lon             DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.place_category,
    p.address,
    p.neighborhood,
    p.phone,
    p.website,
    p.hours,
    p.description,
    p.kosher,
    p.price_range,
    p.hmo,
    p.photos,
    p.attributes,
    p.avg_rating,
    p.rec_count,
    p.is_verified,
    p.source,
    ST_Y(p.location::geometry)::DOUBLE PRECISION AS lat,
    ST_X(p.location::geometry)::DOUBLE PRECISION AS lon
  FROM public.places p
  WHERE
    ST_Within(p.location::geometry, ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
    AND (p_categories IS NULL OR p.place_category::TEXT = ANY(p_categories))
  ORDER BY p.avg_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
) TO anon;
GRANT EXECUTE ON FUNCTION public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
) TO authenticated;

-- =============================================================================
-- MIGRATE ganim_v2 → places (category = 'kids')
--
-- Notes:
--   - New UUID per row; original id stored in attributes.ganmatch_id for traceability.
--   - Phone lives in metadata as a JSON array; extracted with jsonb_array_elements_text.
--   - price_range bucketed: <1500 NIS = 1, 1500–3000 = 2, >3000 = 3.
--   - Ganim-specific fields go into attributes (not top-level columns).
--   - Rows only inserted for ganim where city = 'גבעתיים' (Givatayim).
--     Remove the WHERE clause to import all cities if scope expands.
-- =============================================================================
INSERT INTO public.places (
  name,
  place_category,
  location,
  address,
  phone,
  website,
  hours,
  kosher,
  price_range,
  photos,
  attributes,
  is_verified,
  source,
  suggested_by,
  created_at,
  updated_at
)
SELECT
  g.name_he,
  'kids'::public.place_category,
  g.location,
  COALESCE(g.address || CASE WHEN g.city IS NOT NULL THEN ', ' || g.city ELSE '' END, g.city),
  CASE
    WHEN g.metadata ? 'phone'
    THEN ARRAY(SELECT jsonb_array_elements_text(g.metadata->'phone'))
    ELSE NULL
  END,
  g.website_url,
  g.operating_hours,
  CASE g.kosher_status
    WHEN 'CERTIFIED'     THEN 'CERTIFIED'::public.kosher_status
    WHEN 'NOT_CERTIFIED' THEN 'NOT_CERTIFIED'::public.kosher_status
    ELSE NULL
  END,
  CASE
    WHEN g.monthly_price_nis IS NULL  THEN NULL
    WHEN g.monthly_price_nis < 1500   THEN 1
    WHEN g.monthly_price_nis < 3000   THEN 2
    ELSE 3
  END::SMALLINT,
  '{}',
  jsonb_strip_nulls(jsonb_build_object(
    'ganmatch_id',      g.id::TEXT,
    'gan_category',     g.category::TEXT,
    'min_age_months',   g.min_age_months,
    'max_age_months',   g.max_age_months,
    'meal_type',        g.meal_type::TEXT,
    'friday_schedule',  g.friday_schedule::TEXT,
    'has_outdoor_space',g.has_outdoor_space,
    'vacancy_status',   g.vacancy_status::TEXT,
    'monthly_price_nis',g.monthly_price_nis,
    'maon_symbol_code', g.maon_symbol_code
  )),
  g.is_verified,
  'migrated_ganmatch',
  g.suggested_by,
  g.created_at,
  g.updated_at
FROM public.ganim_v2 g
WHERE g.city = 'גבעתיים';

NOTIFY pgrst, 'reload schema';
