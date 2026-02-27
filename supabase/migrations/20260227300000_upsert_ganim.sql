-- Upsert ganim: avoid duplicates when re-running scraper.
-- Matches on (name_he, city_key); updates existing rows with fresh data.

-- 1. Add city_key for reliable unique matching (handles NULL city)
ALTER TABLE ganim ADD COLUMN IF NOT EXISTS city_key TEXT NOT NULL DEFAULT '';
UPDATE ganim SET city_key = COALESCE(city, '') WHERE city_key = '' OR city_key IS NULL;

-- 2. Remove existing duplicates (keep one per name_he, city_key)
DELETE FROM ganim a
USING ganim b
WHERE a.id > b.id
  AND a.name_he = b.name_he
  AND a.city_key = b.city_key;

-- 3. Unique constraint for upsert (column-based, works with ON CONFLICT)
ALTER TABLE ganim DROP CONSTRAINT IF EXISTS ganim_name_city_key_key;
ALTER TABLE ganim ADD CONSTRAINT ganim_name_city_key_key UNIQUE (name_he, city_key);

-- 4. Replace insert_gan with upsert logic.
-- Do NOT overwrite location with city-center fallback when the row already exists
-- (preserves coords from map links on re-runs).
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
  v_city_key TEXT;
  v_is_city_center BOOLEAN;
BEGIN
  v_city_key := COALESCE(p_city, '');
  v_is_city_center := (p_lat = 32.0853 AND p_lon = 34.7818)
    OR (p_lat = 32.0702 AND p_lon = 34.8117)
    OR (ABS(p_lat - 32.08) < 0.001 AND ABS(p_lon - 34.78) < 0.001);

  INSERT INTO ganim (
    name_he,
    name_en,
    address,
    city,
    city_key,
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
    v_city_key,
    p_type,
    p_license_status,
    p_has_cctv,
    p_metadata,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  )
  ON CONFLICT (name_he, city_key) DO UPDATE SET
    name_en = EXCLUDED.name_en,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    type = EXCLUDED.type,
    license_status = EXCLUDED.license_status,
    has_cctv = EXCLUDED.has_cctv,
    metadata = EXCLUDED.metadata,
    location = CASE
      WHEN v_is_city_center THEN ganim.location
      ELSE EXCLUDED.location
    END,
    updated_at = NOW()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
