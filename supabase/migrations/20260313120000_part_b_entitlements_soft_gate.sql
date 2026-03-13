-- Part B: Entitlements and soft-gate foundation

CREATE TABLE IF NOT EXISTS public.user_access_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entitlement_type TEXT NOT NULL CHECK (entitlement_type IN ('full_access', 'review_quota')),
  source TEXT NOT NULL CHECK (source IN ('review', 'bounty', 'referral', 'onboarding', 'admin')),
  source_ref TEXT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  quota_remaining INT NULL CHECK (quota_remaining IS NULL OR quota_remaining >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_access_entitlements_user_id
  ON public.user_access_entitlements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_entitlements_active_window
  ON public.user_access_entitlements (user_id, entitlement_type, starts_at, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_access_entitlements_source_ref
  ON public.user_access_entitlements (user_id, source, source_ref)
  WHERE source_ref IS NOT NULL;

ALTER TABLE public.user_access_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_access_entitlements_select_own ON public.user_access_entitlements;
CREATE POLICY user_access_entitlements_select_own
  ON public.user_access_entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_access_entitlements_select_service_role ON public.user_access_entitlements;
CREATE POLICY user_access_entitlements_select_service_role
  ON public.user_access_entitlements
  FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS user_access_entitlements_insert_service_role ON public.user_access_entitlements;
CREATE POLICY user_access_entitlements_insert_service_role
  ON public.user_access_entitlements
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS user_access_entitlements_update_service_role ON public.user_access_entitlements;
CREATE POLICY user_access_entitlements_update_service_role
  ON public.user_access_entitlements
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.user_onboarding_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  number_of_kids INT NOT NULL CHECK (number_of_kids > 0 AND number_of_kids <= 20),
  kids_ages INT[] NOT NULL,
  neighborhood TEXT NULL,
  budget_range TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_onboarding_profiles_user_id
  ON public.user_onboarding_profiles (user_id);

ALTER TABLE public.user_onboarding_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_onboarding_profiles_select_own ON public.user_onboarding_profiles;
CREATE POLICY user_onboarding_profiles_select_own
  ON public.user_onboarding_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_onboarding_profiles_insert_own ON public.user_onboarding_profiles;
CREATE POLICY user_onboarding_profiles_insert_own
  ON public.user_onboarding_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS user_onboarding_profiles_update_own ON public.user_onboarding_profiles;
CREATE POLICY user_onboarding_profiles_update_own
  ON public.user_onboarding_profiles
  FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS user_onboarding_profiles_select_service_role ON public.user_onboarding_profiles;
CREATE POLICY user_onboarding_profiles_select_service_role
  ON public.user_onboarding_profiles
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.user_bounty_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_keys TEXT[] NOT NULL,
  task_count INT NOT NULL CHECK (task_count >= 0),
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_bounty_completions_user_id
  ON public.user_bounty_completions (user_id, created_at DESC);

ALTER TABLE public.user_bounty_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_bounty_completions_select_own ON public.user_bounty_completions;
CREATE POLICY user_bounty_completions_select_own
  ON public.user_bounty_completions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_bounty_completions_insert_own ON public.user_bounty_completions;
CREATE POLICY user_bounty_completions_insert_own
  ON public.user_bounty_completions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

DROP POLICY IF EXISTS user_bounty_completions_select_service_role ON public.user_bounty_completions;
CREATE POLICY user_bounty_completions_select_service_role
  ON public.user_bounty_completions
  FOR SELECT
  USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
