-- Add a field to distinguish "CCTV exists" vs "parents can stream online".
-- Keep backwards compatibility with existing has_cctv boolean.

ALTER TABLE public.ganim
  ADD COLUMN IF NOT EXISTS cctv_streamed_online BOOLEAN;

-- Backfill for user-suggested ganim (based on metadata.cctv_access if present)
UPDATE public.ganim
SET
  has_cctv = CASE
    WHEN (metadata->>'cctv_access') IN ('online', 'exceptional') THEN TRUE
    ELSE has_cctv
  END,
  cctv_streamed_online = CASE
    WHEN (metadata->>'cctv_access') = 'online' THEN TRUE
    WHEN (metadata->>'cctv_access') = 'exceptional' THEN FALSE
    ELSE cctv_streamed_online
  END
WHERE is_verified = FALSE
  AND metadata ? 'cctv_access';

-- Update suggest_gan RPC to populate has_cctv + cctv_streamed_online from p_metadata.cctv_access
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
  v_cctv_access TEXT;
  v_has_cctv BOOLEAN;
  v_streamed_online BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_cctv_access := COALESCE(p_metadata->>'cctv_access', '');
  v_has_cctv := (v_cctv_access IN ('online', 'exceptional'));
  v_streamed_online := CASE
    WHEN v_cctv_access = 'online' THEN TRUE
    WHEN v_cctv_access = 'exceptional' THEN FALSE
    ELSE NULL
  END;

  INSERT INTO public.ganim (
    name_he,
    name_en,
    address,
    city,
    type,
    license_status,
    has_cctv,
    cctv_streamed_online,
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
    v_has_cctv,
    v_streamed_online,
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

-- Update read RPCs to include cctv_streamed_online
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
  cctv_streamed_online BOOLEAN,
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
    g.cctv_streamed_online,
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
  cctv_streamed_online BOOLEAN,
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
    g.cctv_streamed_online,
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

GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

