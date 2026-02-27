-- Fetch all ganim (no bbox filter). Use for initial load so all points show on map.

CREATE OR REPLACE FUNCTION get_all_ganim(p_limit INT DEFAULT 1000)
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
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
