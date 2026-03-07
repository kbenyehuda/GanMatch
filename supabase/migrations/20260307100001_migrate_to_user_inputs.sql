-- Migrate existing user-generated data into user_inputs ledger.
-- Run after 20260307100000_create_user_inputs.sql

-- =============================================================================
-- 1. gan_edit_requests -> user_inputs (edits to existing ganim)
-- =============================================================================
INSERT INTO public.user_inputs (
  user_id,
  created_at,
  gan_id,
  is_new_gan,
  -- From patch JSONB
  address,
  city,
  monthly_price_nis,
  min_age_months,
  max_age_months,
  price_notes,
  website_url,
  category,
  maon_symbol_code,
  private_supervision,
  mishpachton_affiliation,
  municipal_grade,
  has_cctv,
  cctv_streamed_online,
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
  metadata
)
SELECT
  ger.user_id,
  ger.created_at,
  ger.gan_id,
  FALSE,
  (ger.patch->>'address')::TEXT,
  (ger.patch->>'city')::TEXT,
  (ger.patch->>'monthly_price_nis')::NUMERIC,
  (ger.patch->>'min_age_months')::INT,
  (ger.patch->>'max_age_months')::INT,
  (ger.patch->>'price_notes')::TEXT,
  (ger.patch->>'website_url')::TEXT,
  (ger.patch->>'category')::public.gan_category,
  (ger.patch->>'maon_symbol_code')::TEXT,
  (ger.patch->>'private_supervision')::public.private_supervision_status,
  (ger.patch->>'mishpachton_affiliation')::public.mishpachton_affiliation,
  (ger.patch->>'municipal_grade')::public.municipal_grade,
  (ger.patch->>'has_cctv')::BOOLEAN,
  (ger.patch->>'cctv_streamed_online')::BOOLEAN,
  (ger.patch->>'operating_hours')::TEXT,
  (ger.patch->>'friday_schedule')::public.friday_schedule,
  (ger.patch->>'meal_type')::public.meal_type,
  (ger.patch->>'vegan_friendly')::BOOLEAN,
  (ger.patch->>'vegetarian_friendly')::BOOLEAN,
  (ger.patch->>'meat_served')::BOOLEAN,
  (ger.patch->>'allergy_friendly')::BOOLEAN,
  (ger.patch->>'kosher_status')::public.kosher_status,
  (ger.patch->>'kosher_certifier')::TEXT,
  (ger.patch->>'staff_child_ratio')::NUMERIC,
  (ger.patch->>'first_aid_trained')::BOOLEAN,
  (SELECT array_agg(elem::public.spoken_language) FROM jsonb_array_elements_text(ger.patch->'languages_spoken') elem)::public.spoken_language[],
  (ger.patch->>'has_outdoor_space')::BOOLEAN,
  (ger.patch->>'has_mamad')::BOOLEAN,
  (SELECT array_agg(elem::TEXT) FROM jsonb_array_elements_text(ger.patch->'chugim_types') elem)::TEXT[],
  (ger.patch->>'vacancy_status')::public.vacancy_status,
  jsonb_build_object(
    'source', 'gan_edit_requests',
    'original_id', ger.id,
    'neighborhood', ger.patch->'neighborhood',
    'suggested_type', ger.patch->'suggested_type',
    'pikuach_ironi', ger.patch->'pikuach_ironi',
    'phone', ger.patch->'phone',
    'phone_whatsapp', ger.patch->'phone_whatsapp',
    'address_extra', ger.patch->'address_extra'
  )
FROM public.gan_edit_requests ger
WHERE ger.gan_id IN (SELECT id FROM public.ganim_v2);

-- gan_edit_requests may reference ganim (legacy); only migrate those that exist in ganim_v2
-- If gan_edit_requests references ganim not ganim_v2, we need to handle. Check FK: gan_edit_requests.gan_id -> ganim(id).
-- ganim and ganim_v2 share ids for rows that exist in both. So ger.gan_id should work for ganim_v2.

-- =============================================================================
-- 2. gan_suggestions + ganim_v2 -> user_inputs (new gan suggestions)
-- =============================================================================
INSERT INTO public.user_inputs (
  user_id,
  created_at,
  gan_id,
  is_new_gan,
  name_he,
  name_en,
  address,
  city,
  lat,
  lon,
  website_url,
  category,
  has_cctv,
  cctv_streamed_online,
  metadata,
  parent_in_gan
)
SELECT
  g.suggested_by,
  COALESCE(g.suggested_at, g.created_at),
  g.id,
  TRUE,
  g.name_he,
  g.name_en,
  g.address,
  g.city,
  ST_Y(g.location::geometry),
  ST_X(g.location::geometry),
  g.website_url,
  g.category,
  g.has_cctv,
  g.cctv_streamed_online,
  g.metadata || jsonb_build_object('source', 'gan_suggestions'),
  TRUE
FROM public.ganim_v2 g
WHERE g.suggested_by IS NOT NULL
  AND g.is_verified = FALSE;

-- =============================================================================
-- 3. reviews -> user_inputs (recommendations / parent feedback)
-- =============================================================================
INSERT INTO public.user_inputs (
  user_id,
  created_at,
  gan_id,
  is_new_gan,
  parent_in_gan,
  anonymous,
  allows_messages,
  free_text_rec,
  metadata
)
SELECT
  r.user_id,
  COALESCE(r.created_at, NOW()),
  r.gan_id,
  FALSE,
  TRUE,
  COALESCE(r.is_anonymous, TRUE),
  COALESCE(r.allow_contact, r.available_for_private_messages, FALSE),
  TRIM(CONCAT_WS(E'\n\n',
    NULLIF(TRIM(r.pros_text), ''),
    NULLIF(TRIM(r.cons_text), ''),
    NULLIF(TRIM(r.advice_to_parents_text), '')
  )),
  jsonb_build_object(
    'source', 'reviews',
    'original_id', r.id,
    'rating', r.rating,
    'cleanliness_rating', r.cleanliness_rating,
    'staff_rating', r.staff_rating,
    'communication_rating', r.communication_rating,
    'food_rating', r.food_rating,
    'location_rating', r.location_rating,
    'safety_rating', r.safety_rating,
    'enrollment_years', r.enrollment_years,
    'reference_tags', r.reference_tags
  )
FROM public.reviews r;

-- =============================================================================
-- 4. visit_notes -> user_inputs
-- =============================================================================
INSERT INTO public.user_inputs (
  user_id,
  created_at,
  gan_id,
  is_new_gan,
  parent_in_gan,
  free_text_rec,
  metadata
)
SELECT
  vn.user_id,
  vn.created_at,
  vn.gan_id,
  FALSE,
  TRUE,
  vn.note_text,
  jsonb_build_object('source', 'visit_notes', 'original_id', vn.id)
FROM public.visit_notes vn
WHERE vn.gan_id IN (SELECT id FROM public.ganim_v2);

-- visit_notes.gan_id may reference ganim; only migrate if gan exists in ganim_v2

-- =============================================================================
-- 5. waitlist_reports -> user_inputs
-- =============================================================================
INSERT INTO public.user_inputs (
  user_id,
  created_at,
  gan_id,
  is_new_gan,
  metadata
)
SELECT
  wr.user_id,
  wr.reported_at,
  wr.gan_id,
  FALSE,
  jsonb_build_object(
    'source', 'waitlist_reports',
    'status', wr.status,
    'notes', wr.notes
  )
FROM public.waitlist_reports wr
WHERE wr.gan_id IN (SELECT id FROM public.ganim_v2);

NOTIFY pgrst, 'reload schema';
