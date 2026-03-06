-- Add "Verified Alumnus / Private Reference" feature
-- Allows parents to mark themselves as having attended a Gan without writing a public review.
-- Also allows public reviewers to opt into the Parent Network for private inquiries.

-- =============================================================================
-- REVIEWS: new columns for private references and parent network
-- =============================================================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_private_reference BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS enrollment_years TEXT,
  ADD COLUMN IF NOT EXISTS reference_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS available_for_private_messages BOOLEAN NOT NULL DEFAULT FALSE;

-- Make rating nullable for private references (they have no rating)
ALTER TABLE public.reviews ALTER COLUMN rating DROP NOT NULL;

-- Drop old rating check and add new one that allows NULL for private refs
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_rating_check
  CHECK (
    (is_private_reference = TRUE AND rating IS NULL)
    OR
    (COALESCE(is_private_reference, FALSE) = FALSE AND rating IS NOT NULL
     AND rating >= 0.5 AND rating <= 5 AND (rating * 2) = floor(rating * 2))
  );

-- Private refs are always anonymous for display
COMMENT ON COLUMN public.reviews.is_private_reference IS 'When true, this is a private reference only (no public review). Excluded from public reviews list and rating aggregates.';
COMMENT ON COLUMN public.reviews.enrollment_years IS 'Years of attendance, e.g. "2020-2022" or "2023". Used for both private refs and network entries.';
COMMENT ON COLUMN public.reviews.reference_tags IS 'Topics the parent can answer questions about, e.g. Staff, Food, Safety.';
COMMENT ON COLUMN public.reviews.available_for_private_messages IS 'When true on a public review, also show in Parent Network for private inquiries.';

CREATE INDEX IF NOT EXISTS idx_reviews_is_private_reference ON public.reviews (gan_id) WHERE is_private_reference = TRUE;
CREATE INDEX IF NOT EXISTS idx_reviews_available_for_private ON public.reviews (gan_id) WHERE available_for_private_messages = TRUE;

-- =============================================================================
-- RPCs: exclude private references from rating aggregates
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
  LEFT JOIN public.reviews r ON r.gan_id = g.id AND (r.is_private_reference IS NOT TRUE)
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
  LEFT JOIN public.reviews r ON r.gan_id = g.id AND (r.is_private_reference IS NOT TRUE)
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
