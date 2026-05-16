-- Fix get_places_in_bbox to use the GIST geography index.
-- The original query cast p.location::geometry before ST_Within, which
-- defeated the GIST index on the geography column (causing full table scans
-- and statement_timeout errors on Supabase).
-- Using the && operator directly on geography hits the index correctly.

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
    -- Use && on geography so the GIST geography index is hit (no ::geometry cast on the WHERE side)
    p.location && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography
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

NOTIFY pgrst, 'reload schema';
