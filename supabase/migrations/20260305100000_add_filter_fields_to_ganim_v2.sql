-- Add filter fields to ganim_v2 for operating hours, fridays, meal type, dietary, etc.
-- All columns nullable; data will be filled via user edits or future imports.

-- =============================================================================
-- ENUMS
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friday_schedule') THEN
    CREATE TYPE public.friday_schedule AS ENUM ('NONE', 'EVERY_FRIDAY', 'EVERY_OTHER_FRIDAY', 'UNKNOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meal_type') THEN
    CREATE TYPE public.meal_type AS ENUM ('IN_HOUSE_COOK', 'EXTERNAL_CATERING', 'PARENTS_BRING', 'MIXED', 'UNKNOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kosher_status') THEN
    CREATE TYPE public.kosher_status AS ENUM ('CERTIFIED', 'NOT_CERTIFIED', 'UNKNOWN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'spoken_language') THEN
    CREATE TYPE public.spoken_language AS ENUM ('HEBREW', 'ENGLISH', 'RUSSIAN', 'ARABIC');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vacancy_status') THEN
    CREATE TYPE public.vacancy_status AS ENUM ('Available', 'Limited', 'Full', 'UNKNOWN');
  END IF;
END $$;

-- =============================================================================
-- COLUMNS
-- =============================================================================
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS operating_hours TEXT;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS friday_schedule public.friday_schedule;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS meal_type public.meal_type;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS vegan_friendly BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS vegetarian_friendly BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS meat_served BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS allergy_friendly BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS kosher_status public.kosher_status;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS kosher_certifier TEXT;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS staff_child_ratio NUMERIC(4,2);
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS first_aid_trained BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS languages_spoken public.spoken_language[];
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS has_outdoor_space BOOLEAN;
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS chugim_types TEXT[];
ALTER TABLE public.ganim_v2 ADD COLUMN IF NOT EXISTS vacancy_status public.vacancy_status;

-- Indexes for common filters
CREATE INDEX IF NOT EXISTS idx_ganim_v2_friday_schedule ON public.ganim_v2 (friday_schedule);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_meal_type ON public.ganim_v2 (meal_type);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_kosher_status ON public.ganim_v2 (kosher_status);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_vacancy_status ON public.ganim_v2 (vacancy_status);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_languages_spoken ON public.ganim_v2 USING GIN (languages_spoken);
CREATE INDEX IF NOT EXISTS idx_ganim_v2_chugim_types ON public.ganim_v2 USING GIN (chugim_types);

-- =============================================================================
-- READ RPCs: include new columns (and website_url if missing from prior migration)
-- =============================================================================
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
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    g.website_url,
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
    g.operating_hours,
    g.friday_schedule,
    g.meal_type,
    g.vegan_friendly,
    g.vegetarian_friendly,
    g.meat_served,
    g.allergy_friendly,
    g.kosher_status,
    g.kosher_certifier,
    g.staff_child_ratio,
    g.first_aid_trained,
    g.languages_spoken,
    g.has_outdoor_space,
    g.chugim_types,
    g.vacancy_status,
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
    g.id,
    g.name_he,
    g.name_en,
    g.address,
    g.city,
    g.website_url,
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
    g.operating_hours,
    g.friday_schedule,
    g.meal_type,
    g.vegan_friendly,
    g.vegetarian_friendly,
    g.meat_served,
    g.allergy_friendly,
    g.kosher_status,
    g.kosher_certifier,
    g.staff_child_ratio,
    g.first_aid_trained,
    g.languages_spoken,
    g.has_outdoor_space,
    g.chugim_types,
    g.vacancy_status,
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
