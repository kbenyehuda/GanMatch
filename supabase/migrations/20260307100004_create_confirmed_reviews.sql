-- Step 1: Create confirmed_reviews (published reviews - output of verification script).
-- Step 2: Copy all data from reviews into confirmed_reviews.
-- Step 3: Update review_contact_messages FK to reference confirmed_reviews.
-- Step 4: Update RPCs to use confirmed_reviews instead of reviews.

-- =============================================================================
-- 1. Create confirmed_reviews (same structure as reviews)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.confirmed_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gan_id UUID NOT NULL REFERENCES public.ganim_v2(id) ON DELETE CASCADE,
  rating NUMERIC(2,1) NOT NULL,
  cleanliness_rating NUMERIC(2,1),
  staff_rating NUMERIC(2,1),
  communication_rating NUMERIC(2,1),
  food_rating NUMERIC(2,1),
  location_rating NUMERIC(2,1),
  safety_rating NUMERIC(2,1),
  pros_text TEXT,
  cons_text TEXT,
  advice_to_parents_text TEXT,
  enrollment_year SMALLINT,
  enrollment_years TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
  allow_contact BOOLEAN NOT NULL DEFAULT TRUE,
  is_private_reference BOOLEAN NOT NULL DEFAULT FALSE,
  reference_tags TEXT[] DEFAULT '{}',
  reviewer_public_name TEXT,
  reviewer_public_email_masked TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, gan_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_reviews_gan_id ON public.confirmed_reviews (gan_id);
CREATE INDEX IF NOT EXISTS idx_confirmed_reviews_user_id ON public.confirmed_reviews (user_id);

ALTER TABLE public.confirmed_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY confirmed_reviews_select ON public.confirmed_reviews FOR SELECT USING (true);

-- =============================================================================
-- 2. Migrate reviews -> confirmed_reviews
-- =============================================================================
INSERT INTO public.confirmed_reviews (
  id, user_id, gan_id, rating, cleanliness_rating, staff_rating, communication_rating,
  food_rating, location_rating, safety_rating, pros_text, cons_text, advice_to_parents_text,
  enrollment_year, enrollment_years, is_anonymous, allow_contact, is_private_reference,
  reference_tags, reviewer_public_name, reviewer_public_email_masked, created_at, updated_at
)
SELECT
  r.id, r.user_id, r.gan_id, r.rating, r.cleanliness_rating, r.staff_rating, r.communication_rating,
  r.food_rating, r.location_rating, r.safety_rating, r.pros_text, r.cons_text, r.advice_to_parents_text,
  r.enrollment_year, r.enrollment_years, COALESCE(r.is_anonymous, TRUE),
  COALESCE(r.allow_contact, TRUE),
  COALESCE(r.is_private_reference, FALSE), COALESCE(r.reference_tags, '{}'),
  r.reviewer_public_name, r.reviewer_public_email_masked, r.created_at, r.updated_at
FROM public.reviews r
ON CONFLICT (user_id, gan_id) DO NOTHING;

-- =============================================================================
-- 3. Update review_contact_messages FK: reviews -> confirmed_reviews (if table exists)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'review_contact_messages'
  ) THEN
    ALTER TABLE public.review_contact_messages DROP CONSTRAINT IF EXISTS review_contact_messages_review_id_fkey;
    ALTER TABLE public.review_contact_messages
      ADD CONSTRAINT review_contact_messages_review_id_fkey
      FOREIGN KEY (review_id) REFERENCES public.confirmed_reviews(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 4. Update RPCs to use confirmed_reviews
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_all_ganim(INT);
DROP FUNCTION IF EXISTS public.get_ganim_in_bbox(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, INT);

CREATE OR REPLACE FUNCTION public.get_all_ganim(p_limit INT DEFAULT 100000)
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
  LEFT JOIN public.confirmed_reviews r ON r.gan_id = g.id
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
  LEFT JOIN public.confirmed_reviews r ON r.gan_id = g.id
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
