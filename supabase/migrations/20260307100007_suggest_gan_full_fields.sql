-- Extend suggest_gan to extract and store all fields from p_metadata into user_inputs.
-- Run after 20260307100006_suggest_gan_to_user_inputs.sql

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
  v_uid UUID;
  v_input_id UUID;
  v_meta JSONB;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Merge source into metadata (don't overwrite user-provided keys)
  v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'user_suggestion');

  INSERT INTO public.user_inputs (
    user_id,
    gan_id,
    is_new_gan,
    input_type,
    name_he,
    address,
    city,
    lat,
    lon,
    website_url,
    category,
    maon_symbol_code,
    private_supervision,
    mishpachton_affiliation,
    municipal_grade,
    has_cctv,
    cctv_streamed_online,
    monthly_price_nis,
    min_age_months,
    max_age_months,
    price_notes,
    operating_hours,
    friday_schedule,
    meal_type,
    vegan_friendly,
    vegetarian_friendly,
    meat_served,
    allergy_friendly,
    kosher_status,
    kosher_certifier,
    staff_child_ratio,
    first_aid_trained,
    languages_spoken,
    has_outdoor_space,
    has_mamad,
    chugim_types,
    vacancy_status,
    metadata,
    parent_in_gan
  ) VALUES (
    v_uid,
    NULL,
    TRUE,
    'suggest_gan'::public.user_input_type,
    p_name_he,
    COALESCE(p_address, (v_meta->>'address')::TEXT),
    COALESCE(p_city, (v_meta->>'city')::TEXT),
    p_lat,
    p_lon,
    (v_meta->>'website_url')::TEXT,
    NULLIF(v_meta->>'category', '')::public.gan_category,
    NULLIF(TRIM(v_meta->>'maon_symbol_code'), '')::TEXT,
    NULLIF(v_meta->>'private_supervision', '')::public.private_supervision_status,
    NULLIF(v_meta->>'mishpachton_affiliation', '')::public.mishpachton_affiliation,
    NULLIF(v_meta->>'municipal_grade', '')::public.municipal_grade,
    (v_meta->>'cctv_access') IN ('online', 'exceptional'),
    CASE
      WHEN (v_meta->>'cctv_access') = 'online' THEN TRUE
      WHEN (v_meta->>'cctv_access') = 'exceptional' THEN FALSE
      ELSE NULL
    END,
    (v_meta->>'monthly_price_nis')::NUMERIC,
    (v_meta->>'min_age_months')::INT,
    (v_meta->>'max_age_months')::INT,
    NULLIF(TRIM(v_meta->>'price_notes'), '')::TEXT,
    NULLIF(TRIM(v_meta->>'operating_hours'), '')::TEXT,
    NULLIF(v_meta->>'friday_schedule', '')::public.friday_schedule,
    NULLIF(v_meta->>'meal_type', '')::public.meal_type,
    (v_meta->>'vegan_friendly')::BOOLEAN,
    (v_meta->>'vegetarian_friendly')::BOOLEAN,
    (v_meta->>'meat_served')::BOOLEAN,
    (v_meta->>'allergy_friendly')::BOOLEAN,
    NULLIF(v_meta->>'kosher_status', '')::public.kosher_status,
    NULLIF(TRIM(v_meta->>'kosher_certifier'), '')::TEXT,
    (v_meta->>'staff_child_ratio')::NUMERIC,
    (v_meta->>'first_aid_trained')::BOOLEAN,
    (SELECT array_agg(elem::public.spoken_language) FROM jsonb_array_elements_text(COALESCE(v_meta->'languages_spoken', '[]'::jsonb)) elem)::public.spoken_language[],
    (v_meta->>'has_outdoor_space')::BOOLEAN,
    (v_meta->>'has_mamad')::BOOLEAN,
    (SELECT array_agg(elem::TEXT) FROM jsonb_array_elements_text(COALESCE(v_meta->'chugim_types', '[]'::jsonb)) elem)::TEXT[],
    NULLIF(v_meta->>'vacancy_status', '')::public.vacancy_status,
    v_meta,
    TRUE
  )
  RETURNING id INTO v_input_id;

  RETURN v_input_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_gan(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';
