-- Recommendations (half-star + facets) and user suggestions (unverified ganim)

-- =============================================================================
-- REVIEWS: allow half-star ratings + anonymous flag + facet ratings
-- =============================================================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT TRUE;

-- Convert rating to NUMERIC(2,1) to support half-stars (0.5 increments)
DO $$
BEGIN
  -- Drop auto-generated constraint name if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_rating_check'
      AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews DROP CONSTRAINT reviews_rating_check;
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;

ALTER TABLE public.reviews
  ALTER COLUMN rating TYPE NUMERIC(2,1) USING rating::numeric,
  ALTER COLUMN rating SET NOT NULL;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_rating_check
  CHECK (
    rating >= 0.5
    AND rating <= 5
    AND (rating * 2) = floor(rating * 2)
  );

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS cleanliness_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS staff_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS communication_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS food_rating NUMERIC(2,1),
  ADD COLUMN IF NOT EXISTS location_rating NUMERIC(2,1);

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_cleanliness_rating_check,
  DROP CONSTRAINT IF EXISTS reviews_staff_rating_check,
  DROP CONSTRAINT IF EXISTS reviews_communication_rating_check,
  DROP CONSTRAINT IF EXISTS reviews_food_rating_check,
  DROP CONSTRAINT IF EXISTS reviews_location_rating_check;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_cleanliness_rating_check
  CHECK (cleanliness_rating IS NULL OR (cleanliness_rating >= 0.5 AND cleanliness_rating <= 5 AND (cleanliness_rating * 2) = floor(cleanliness_rating * 2))),
  ADD CONSTRAINT reviews_staff_rating_check
  CHECK (staff_rating IS NULL OR (staff_rating >= 0.5 AND staff_rating <= 5 AND (staff_rating * 2) = floor(staff_rating * 2))),
  ADD CONSTRAINT reviews_communication_rating_check
  CHECK (communication_rating IS NULL OR (communication_rating >= 0.5 AND communication_rating <= 5 AND (communication_rating * 2) = floor(communication_rating * 2))),
  ADD CONSTRAINT reviews_food_rating_check
  CHECK (food_rating IS NULL OR (food_rating >= 0.5 AND food_rating <= 5 AND (food_rating * 2) = floor(food_rating * 2))),
  ADD CONSTRAINT reviews_location_rating_check
  CHECK (location_rating IS NULL OR (location_rating >= 0.5 AND location_rating <= 5 AND (location_rating * 2) = floor(location_rating * 2)));

-- Ensure upserts/updates keep user ownership constraints
DROP POLICY IF EXISTS reviews_update ON public.reviews;
CREATE POLICY reviews_update ON public.reviews
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- GANIM: user suggested ganim visible but unverified
-- =============================================================================
ALTER TABLE public.ganim
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS suggested_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_at TIMESTAMPTZ DEFAULT NOW();

-- =============================================================================
-- SUGGESTION QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.gan_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gan_id UUID NOT NULL REFERENCES public.ganim(id) ON DELETE CASCADE,
  suggested_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT
);

ALTER TABLE public.gan_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gan_suggestions_select ON public.gan_suggestions;
CREATE POLICY gan_suggestions_select ON public.gan_suggestions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS gan_suggestions_insert ON public.gan_suggestions;
CREATE POLICY gan_suggestions_insert ON public.gan_suggestions
  FOR INSERT WITH CHECK (auth.uid() = suggested_by);

DROP POLICY IF EXISTS gan_suggestions_update_service_role ON public.gan_suggestions;
CREATE POLICY gan_suggestions_update_service_role ON public.gan_suggestions
  FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- RPC: suggest a new gan (requires auth.uid())
-- =============================================================================
CREATE OR REPLACE FUNCTION public.suggest_gan(
  p_name_he TEXT,
  p_lon DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.ganim (
    name_he,
    name_en,
    address,
    city,
    type,
    license_status,
    has_cctv,
    metadata,
    location,
    is_verified,
    suggested_by,
    suggested_at
  ) VALUES (
    p_name_he,
    NULL,
    p_address,
    p_city,
    'Supervised',
    'Temporary',
    FALSE,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'user_suggestion'),
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
    FALSE,
    v_uid,
    NOW()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.gan_suggestions (gan_id, suggested_by, status)
  VALUES (v_id, v_uid, 'pending');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO service_role;

-- =============================================================================
-- RPC: ganim with rating aggregates
-- =============================================================================
-- Postgres cannot change OUT parameter row type via CREATE OR REPLACE.
-- Drop the old signatures first so this migration is repeatable.
DROP FUNCTION IF EXISTS public.get_all_ganim(INT);
DROP FUNCTION IF EXISTS public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION public.get_all_ganim(p_limit INT DEFAULT 1000)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  type TEXT,
  license_status TEXT,
  has_cctv BOOLEAN,
  metadata JSONB,
  is_verified BOOLEAN,
  avg_rating DOUBLE PRECISION,
  avg_cleanliness DOUBLE PRECISION,
  avg_staff DOUBLE PRECISION,
  avg_communication DOUBLE PRECISION,
  avg_food DOUBLE PRECISION,
  avg_location DOUBLE PRECISION,
  recommendation_count INT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    g.type,
    g.license_status,
    g.has_cctv,
    g.metadata,
    g.is_verified,
    AVG(r.rating)::DOUBLE PRECISION AS avg_rating,
    AVG(r.cleanliness_rating)::DOUBLE PRECISION AS avg_cleanliness,
    AVG(r.staff_rating)::DOUBLE PRECISION AS avg_staff,
    AVG(r.communication_rating)::DOUBLE PRECISION AS avg_communication,
    AVG(r.food_rating)::DOUBLE PRECISION AS avg_food,
    AVG(r.location_rating)::DOUBLE PRECISION AS avg_location,
    COUNT(r.id)::INT AS recommendation_count,
    ST_Y(g.location::geometry)::DOUBLE PRECISION AS lat,
    ST_X(g.location::geometry)::DOUBLE PRECISION AS lon
  FROM public.ganim g
  LEFT JOIN public.reviews r ON r.gan_id = g.id
  GROUP BY g.id, g.location, g.is_verified
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_ganim_in_bbox(
  min_lon DOUBLE PRECISION,
  min_lat DOUBLE PRECISION,
  max_lon DOUBLE PRECISION,
  max_lat DOUBLE PRECISION,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  type TEXT,
  license_status TEXT,
  has_cctv BOOLEAN,
  metadata JSONB,
  is_verified BOOLEAN,
  avg_rating DOUBLE PRECISION,
  avg_cleanliness DOUBLE PRECISION,
  avg_staff DOUBLE PRECISION,
  avg_communication DOUBLE PRECISION,
  avg_food DOUBLE PRECISION,
  avg_location DOUBLE PRECISION,
  recommendation_count INT,
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    g.type,
    g.license_status,
    g.has_cctv,
    g.metadata,
    g.is_verified,
    AVG(r.rating)::DOUBLE PRECISION AS avg_rating,
    AVG(r.cleanliness_rating)::DOUBLE PRECISION AS avg_cleanliness,
    AVG(r.staff_rating)::DOUBLE PRECISION AS avg_staff,
    AVG(r.communication_rating)::DOUBLE PRECISION AS avg_communication,
    AVG(r.food_rating)::DOUBLE PRECISION AS avg_food,
    AVG(r.location_rating)::DOUBLE PRECISION AS avg_location,
    COUNT(r.id)::INT AS recommendation_count,
    ST_Y(g.location::geometry)::DOUBLE PRECISION AS lat,
    ST_X(g.location::geometry)::DOUBLE PRECISION AS lon
  FROM public.ganim g
  LEFT JOIN public.reviews r ON r.gan_id = g.id
  WHERE ST_Within(
    g.location::geometry,
    ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  )
  GROUP BY g.id, g.location, g.is_verified
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Make read RPCs accessible from the client
GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

