-- Fix: ST_Within(geography, geography) does not exist in PostGIS.
-- Use geometry cast for the spatial query.

CREATE OR REPLACE FUNCTION get_ganim_in_bbox(
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
    ST_Y(g.location::geometry)::DOUBLE PRECISION AS lat,
    ST_X(g.location::geometry)::DOUBLE PRECISION AS lon
  FROM ganim g
  WHERE ST_Within(
    g.location::geometry,
    ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)
  )
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
