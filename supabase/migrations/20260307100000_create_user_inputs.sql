-- user_inputs: Unified ledger for all user-generated data.
-- Every field is optional (nullable). Only populated fields are stored per row.
-- Python script will consume this table to produce final ganim_v2 output.

-- =============================================================================
-- TABLE: user_inputs
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_inputs (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ledger metadata
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Context: existing gan (edits) vs new gan (suggestions)
  gan_id UUID REFERENCES public.ganim_v2(id) ON DELETE SET NULL,
  is_new_gan BOOLEAN,

  -- User context
  parent_in_gan BOOLEAN,
  anonymous BOOLEAN,
  allows_messages BOOLEAN,
  free_text_rec TEXT,

  -- ========== ganim_v2 fields (all nullable) ==========
  name_he TEXT,
  name_en TEXT,
  address TEXT,
  city TEXT,
  website_url TEXT,

  -- Location (stored as lat/lon for ledger simplicity)
  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,

  -- Categories
  category public.gan_category,
  maon_symbol_code TEXT,
  private_supervision public.private_supervision_status,
  mishpachton_affiliation public.mishpachton_affiliation,
  municipal_grade public.municipal_grade,

  -- Ops
  has_cctv BOOLEAN,
  cctv_streamed_online BOOLEAN,

  -- Pricing & ages
  monthly_price_nis NUMERIC(10,2),
  min_age_months INT,
  max_age_months INT,
  price_notes TEXT,

  -- Filter fields
  operating_hours TEXT,
  friday_schedule public.friday_schedule,
  meal_type public.meal_type,
  vegan_friendly BOOLEAN,
  vegetarian_friendly BOOLEAN,
  meat_served BOOLEAN,
  allergy_friendly BOOLEAN,
  kosher_status public.kosher_status,
  kosher_certifier TEXT,
  staff_child_ratio NUMERIC(4,2),
  first_aid_trained BOOLEAN,
  languages_spoken public.spoken_language[],
  has_outdoor_space BOOLEAN,
  has_mamad BOOLEAN,
  chugim_types TEXT[],
  vacancy_status public.vacancy_status,

  -- Flexible metadata (phone, phone_whatsapp, neighborhood, etc.)
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_user_inputs_gan_id ON public.user_inputs (gan_id);
CREATE INDEX IF NOT EXISTS idx_user_inputs_user_id ON public.user_inputs (user_id);
CREATE INDEX IF NOT EXISTS idx_user_inputs_created_at ON public.user_inputs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_inputs_is_new_gan ON public.user_inputs (is_new_gan) WHERE is_new_gan = TRUE;

ALTER TABLE public.user_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_inputs_insert_authenticated ON public.user_inputs;
CREATE POLICY user_inputs_insert_authenticated ON public.user_inputs
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS user_inputs_select_service_role ON public.user_inputs;
CREATE POLICY user_inputs_select_service_role ON public.user_inputs
  FOR SELECT USING (auth.role() = 'service_role');

-- Allow service_role to insert (for migration script, API server)
DROP POLICY IF EXISTS user_inputs_insert_service_role ON public.user_inputs;
CREATE POLICY user_inputs_insert_service_role ON public.user_inputs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
