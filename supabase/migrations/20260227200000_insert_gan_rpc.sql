-- RPC to insert a gan with geography from lat/lon.
-- Required because Supabase REST API doesn't support PostGIS types directly.

CREATE OR REPLACE FUNCTION insert_gan(
  p_name_he TEXT,
  p_lon DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_name_en TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_type TEXT DEFAULT 'Supervised',
  p_license_status TEXT DEFAULT 'Permanent',
  p_has_cctv BOOLEAN DEFAULT FALSE,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO ganim (
    name_he,
    name_en,
    address,
    city,
    type,
    license_status,
    has_cctv,
    metadata,
    location
  ) VALUES (
    p_name_he,
    p_name_en,
    p_address,
    p_city,
    p_type,
    p_license_status,
    p_has_cctv,
    p_metadata,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Expose to Supabase API (required for RPC to appear in schema cache)
GRANT EXECUTE ON FUNCTION insert_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO anon;
GRANT EXECUTE ON FUNCTION insert_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, JSONB) TO service_role;
