-- Raise get_all_ganim default limit from 1000 to 100000 to match app and Supabase Data API max rows.
CREATE OR REPLACE FUNCTION public.get_all_ganim(p_limit INT DEFAULT 100000)
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
