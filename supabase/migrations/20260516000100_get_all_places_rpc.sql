-- Simple replacement for get_places_in_bbox.
-- Returns all places (no spatial filter) so the JS client can filter by viewport.
-- This avoids PostGIS statement_timeout issues on Supabase free tier.
-- All places are in Givatayim (~500 rows) so fetching everything is fine.

CREATE OR REPLACE FUNCTION public.get_all_places(
  p_limit       INT     DEFAULT 500,
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
  WHERE (p_categories IS NULL OR p.place_category::TEXT = ANY(p_categories))
  ORDER BY p.avg_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_all_places(INT, TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_places(INT, TEXT[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
