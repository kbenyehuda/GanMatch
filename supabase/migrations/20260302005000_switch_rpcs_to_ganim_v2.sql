-- Switch read RPCs to use ganim_v2 as canonical source.
-- Keep function names stable so the app doesn't change.
-- Also update suggest_gan to ensure new suggestions appear in ganim_v2.

-- =============================================================================
-- suggest_gan: keep existing signature used by the client.
-- Insert into legacy ganim (for backward compatibility / existing suggestion FK),
-- then upsert into ganim_v2 with the same id.
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

  -- Legacy insert
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

  -- Canonical v2 upsert (same id)
  INSERT INTO public.ganim_v2 (
    id,
    name_he,
    name_en,
    address,
    city,
    category,
    has_cctv,
    cctv_streamed_online,
    metadata,
    location,
    is_verified,
    suggested_by,
    suggested_at
  )
  SELECT
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    'UNSPECIFIED'::public.gan_category,
    g.has_cctv,
    g.cctv_streamed_online,
    g.metadata,
    g.location,
    g.is_verified,
    g.suggested_by,
    g.suggested_at
  FROM public.ganim g
  WHERE g.id = v_id
  ON CONFLICT (id) DO UPDATE SET
    name_he = EXCLUDED.name_he,
    name_en = EXCLUDED.name_en,
    address = EXCLUDED.address,
    city = EXCLUDED.city,
    has_cctv = EXCLUDED.has_cctv,
    cctv_streamed_online = EXCLUDED.cctv_streamed_online,
    metadata = EXCLUDED.metadata,
    location = EXCLUDED.location,
    is_verified = EXCLUDED.is_verified,
    suggested_by = EXCLUDED.suggested_by,
    suggested_at = EXCLUDED.suggested_at;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO service_role;

-- =============================================================================
-- READ RPCs: now backed by ganim_v2
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_all_ganim(INT);
DROP FUNCTION IF EXISTS public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION public.get_all_ganim(p_limit INT DEFAULT 1000)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  category public.gan_category,
  maon_symbol_code TEXT,
  private_supervision public.private_supervision_status,
  mishpachton_affiliation public.mishpachton_affiliation,
  municipal_grade public.municipal_grade,
  monthly_price_nis NUMERIC,
  min_age_months INT,
  max_age_months INT,
  price_notes TEXT,
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
    g.category,
    g.maon_symbol_code,
    g.private_supervision,
    g.mishpachton_affiliation,
    g.municipal_grade,
    g.monthly_price_nis,
    g.min_age_months,
    g.max_age_months,
    g.price_notes,
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
  FROM public.ganim_v2 g
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
  category public.gan_category,
  maon_symbol_code TEXT,
  private_supervision public.private_supervision_status,
  mishpachton_affiliation public.mishpachton_affiliation,
  municipal_grade public.municipal_grade,
  monthly_price_nis NUMERIC,
  min_age_months INT,
  max_age_months INT,
  price_notes TEXT,
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
    g.category,
    g.maon_symbol_code,
    g.private_supervision,
    g.mishpachton_affiliation,
    g.municipal_grade,
    g.monthly_price_nis,
    g.min_age_months,
    g.max_age_months,
    g.price_notes,
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
  FROM public.ganim_v2 g
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

