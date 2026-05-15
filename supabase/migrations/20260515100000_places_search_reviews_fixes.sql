-- =============================================================================
-- Fix 1: GRANT SELECT on place_reviews to anon + authenticated
-- (RLS policy already allows all reads; explicit GRANT ensures PostgREST exposes it)
-- =============================================================================
GRANT SELECT ON public.place_reviews TO anon, authenticated;

-- =============================================================================
-- Fix 2: search_places RPC — full-text search returning lat/lon via PostGIS
-- =============================================================================
DROP FUNCTION IF EXISTS public.search_places(TEXT, INT, TEXT[]);

CREATE OR REPLACE FUNCTION public.search_places(
  p_query      TEXT,
  p_limit      INT    DEFAULT 20,
  p_categories TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  name           TEXT,
  place_category public.place_category,
  address        TEXT,
  neighborhood   public.neighborhood_givatayim,
  phone          TEXT[],
  website        TEXT,
  hours          TEXT,
  description    TEXT,
  kosher         public.kosher_status,
  price_range    SMALLINT,
  hmo            TEXT[],
  photos         TEXT[],
  attributes     JSONB,
  avg_rating     FLOAT4,
  rec_count      INT,
  is_verified    BOOLEAN,
  source         TEXT,
  lat            DOUBLE PRECISION,
  lon            DOUBLE PRECISION
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
    (
      p.name        ILIKE '%' || p_query || '%'
      OR p.address  ILIKE '%' || p_query || '%'
      OR p.description ILIKE '%' || p_query || '%'
    )
    AND (p_categories IS NULL OR p.place_category::TEXT = ANY(p_categories))
  ORDER BY
    -- Exact name prefix first, then partial, then by rating
    CASE
      WHEN p.name ILIKE p_query || '%' THEN 0
      WHEN p.name ILIKE '%' || p_query || '%' THEN 1
      ELSE 2
    END,
    p.avg_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.search_places(TEXT, INT, TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.search_places(TEXT, INT, TEXT[]) TO authenticated;

-- =============================================================================
-- Fix 3: Migrate confirmed_reviews → place_reviews
-- Joins on attributes.ganmatch_id = confirmed_reviews.gan_id
-- Uses advice_to_parents_text as the review text
-- =============================================================================
INSERT INTO public.place_reviews (
  user_id,
  place_id,
  rating,
  text,
  is_anonymous,
  allow_contact,
  reviewer_public_name,
  reviewer_public_email_masked,
  created_at,
  updated_at
)
SELECT
  cr.user_id,
  p.id                           AS place_id,
  cr.rating,
  cr.advice_to_parents_text      AS text,
  cr.is_anonymous,
  cr.allow_contact,
  cr.reviewer_public_name,
  cr.reviewer_public_email_masked,
  cr.created_at,
  cr.updated_at
FROM public.confirmed_reviews cr
JOIN public.places p
  ON p.attributes->>'ganmatch_id' = cr.gan_id::TEXT
ON CONFLICT (user_id, place_id) DO NOTHING;

-- =============================================================================
-- Fix 4: insert_community_place RPC
-- Needed because PostgREST can't call ST_MakePoint in a direct INSERT.
-- =============================================================================
DROP FUNCTION IF EXISTS public.insert_community_place(
  TEXT, public.place_category, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT[], TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.insert_community_place(
  p_name        TEXT,
  p_category    public.place_category,
  p_lon         DOUBLE PRECISION,
  p_lat         DOUBLE PRECISION,
  p_address     TEXT    DEFAULT NULL,
  p_description TEXT    DEFAULT NULL,
  p_phone       TEXT[]  DEFAULT NULL,
  p_website     TEXT    DEFAULT NULL,
  p_hours       TEXT    DEFAULT NULL,
  p_user_id     UUID    DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.places (
    name, place_category, location,
    address, description, phone, website, hours,
    source, suggested_by
  ) VALUES (
    p_name, p_category,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::GEOGRAPHY,
    p_address, p_description, p_phone, p_website, p_hours,
    'community', p_user_id
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.insert_community_place(
  TEXT, public.place_category, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT[], TEXT, TEXT, UUID
) TO authenticated;

NOTIFY pgrst, 'reload schema';
