-- Add has_mamad (ממ"ד / מיקלט) - safe room / bomb shelter
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS has_mamad BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_ganim_v2_has_mamad ON public.ganim_v2 (has_mamad);

-- Update RPCs to include has_mamad
DROP FUNCTION IF EXISTS public.get_all_ganim(INT);
DROP FUNCTION IF EXISTS public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION public.get_all_ganim(p_limit INT DEFAULT 100000)
RETURNS TABLE (
  id UUID,
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  website_url TEXT,
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
  operating_hours TEXT,
  friday_schedule public.friday_schedule,
  meal_type public.meal_type,
  vegan_friendly BOOLEAN,
  vegetarian_friendly BOOLEAN,
  meat_served BOOLEAN,
  allergy_friendly BOOLEAN,
  kosher_status public.kosher_status,
  kosher_certifier TEXT,
  staff_child_ratio NUMERIC,
  first_aid_trained BOOLEAN,
  languages_spoken public.spoken_language[],
  has_outdoor_space BOOLEAN,
  has_mamad BOOLEAN,
  chugim_types TEXT[],
  vacancy_status public.vacancy_status,
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
    g.id, g.name_he, g.name_en, g.address, g.city, g.website_url,
    g.category, g.maon_symbol_code, g.private_supervision, g.mishpachton_affiliation, g.municipal_grade,
    g.monthly_price_nis, g.min_age_months, g.max_age_months, g.price_notes,
    g.has_cctv, g.cctv_streamed_online, g.operating_hours, g.friday_schedule, g.meal_type,
    g.vegan_friendly, g.vegetarian_friendly, g.meat_served, g.allergy_friendly,
    g.kosher_status, g.kosher_certifier, g.staff_child_ratio, g.first_aid_trained,
    g.languages_spoken, g.has_outdoor_space, g.has_mamad, g.chugim_types, g.vacancy_status,
    g.metadata, g.is_verified,
    AVG(r.rating)::DOUBLE PRECISION, AVG(r.cleanliness_rating)::DOUBLE PRECISION,
    AVG(r.staff_rating)::DOUBLE PRECISION, AVG(r.communication_rating)::DOUBLE PRECISION,
    AVG(r.food_rating)::DOUBLE PRECISION, AVG(r.location_rating)::DOUBLE PRECISION,
    COUNT(r.id)::INT,
    ST_Y(g.location::geometry)::DOUBLE PRECISION,
    ST_X(g.location::geometry)::DOUBLE PRECISION
  FROM public.ganim_v2 g
  LEFT JOIN public.reviews r ON r.gan_id = g.id
  GROUP BY g.id, g.location, g.is_verified
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION public.get_ganim_in_bbox(
  min_lon DOUBLE PRECISION, min_lat DOUBLE PRECISION,
  max_lon DOUBLE PRECISION, max_lat DOUBLE PRECISION,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID, name_he TEXT, name_en TEXT, address TEXT, city TEXT, website_url TEXT,
  category public.gan_category, maon_symbol_code TEXT,
  private_supervision public.private_supervision_status,
  mishpachton_affiliation public.mishpachton_affiliation,
  municipal_grade public.municipal_grade,
  monthly_price_nis NUMERIC, min_age_months INT, max_age_months INT, price_notes TEXT,
  has_cctv BOOLEAN, cctv_streamed_online BOOLEAN,
  operating_hours TEXT, friday_schedule public.friday_schedule, meal_type public.meal_type,
  vegan_friendly BOOLEAN, vegetarian_friendly BOOLEAN, meat_served BOOLEAN, allergy_friendly BOOLEAN,
  kosher_status public.kosher_status, kosher_certifier TEXT, staff_child_ratio NUMERIC,
  first_aid_trained BOOLEAN, languages_spoken public.spoken_language[],
  has_outdoor_space BOOLEAN, has_mamad BOOLEAN, chugim_types TEXT[], vacancy_status public.vacancy_status,
  metadata JSONB, is_verified BOOLEAN,
  avg_rating DOUBLE PRECISION, avg_cleanliness DOUBLE PRECISION, avg_staff DOUBLE PRECISION,
  avg_communication DOUBLE PRECISION, avg_food DOUBLE PRECISION, avg_location DOUBLE PRECISION,
  recommendation_count INT, lat DOUBLE PRECISION, lon DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id, g.name_he, g.name_en, g.address, g.city, g.website_url,
    g.category, g.maon_symbol_code, g.private_supervision, g.mishpachton_affiliation, g.municipal_grade,
    g.monthly_price_nis, g.min_age_months, g.max_age_months, g.price_notes,
    g.has_cctv, g.cctv_streamed_online, g.operating_hours, g.friday_schedule, g.meal_type,
    g.vegan_friendly, g.vegetarian_friendly, g.meat_served, g.allergy_friendly,
    g.kosher_status, g.kosher_certifier, g.staff_child_ratio, g.first_aid_trained,
    g.languages_spoken, g.has_outdoor_space, g.has_mamad, g.chugim_types, g.vacancy_status,
    g.metadata, g.is_verified,
    AVG(r.rating)::DOUBLE PRECISION, AVG(r.cleanliness_rating)::DOUBLE PRECISION,
    AVG(r.staff_rating)::DOUBLE PRECISION, AVG(r.communication_rating)::DOUBLE PRECISION,
    AVG(r.food_rating)::DOUBLE PRECISION, AVG(r.location_rating)::DOUBLE PRECISION,
    COUNT(r.id)::INT,
    ST_Y(g.location::geometry)::DOUBLE PRECISION,
    ST_X(g.location::geometry)::DOUBLE PRECISION
  FROM public.ganim_v2 g
  LEFT JOIN public.reviews r ON r.gan_id = g.id
  WHERE ST_Within(g.location::geometry, ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326))
  GROUP BY g.id, g.location, g.is_verified
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_ganim(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
