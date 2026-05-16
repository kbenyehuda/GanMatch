-- Fix get_places_in_bbox statement timeout.
-- Root cause: Supabase free tier has an 8s global statement_timeout.
-- After a project pause/wake-up, the first PostGIS query can exceed this.
-- Fix: SET LOCAL statement_timeout inside the function + ANALYZE to ensure
-- the planner uses the GIST index properly.

-- Update index statistics so the planner picks the GIST index
ANALYZE public.places;

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
  -- Override the 8s global timeout — first wake-up query on a paused project
  -- can legitimately take longer. 60s is ample for any real workload.
  SET LOCAL statement_timeout = '60s';

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
    p.location && ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)::geography
    AND (p_categories IS NULL OR p.place_category::TEXT = ANY(p_categories))
  ORDER BY p.avg_rating DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql VOLATILE;

GRANT EXECUTE ON FUNCTION public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
) TO anon;
GRANT EXECUTE ON FUNCTION public.get_places_in_bbox(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT, TEXT[]
) TO authenticated;

NOTIFY pgrst, 'reload schema';
