-- Persist per-user/per-gan rejection notice visibility window across devices.
-- Window starts when user first sees a specific rejected edit and lasts 24 hours.

CREATE TABLE IF NOT EXISTS public.user_rejection_notice_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gan_id UUID NOT NULL REFERENCES public.ganim_v2(id) ON DELETE CASCADE,
  rejected_input_id UUID NOT NULL REFERENCES public.user_inputs(id) ON DELETE CASCADE,
  visible_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, gan_id)
);

CREATE INDEX IF NOT EXISTS idx_user_rejection_notice_windows_user_id
  ON public.user_rejection_notice_windows (user_id);

CREATE INDEX IF NOT EXISTS idx_user_rejection_notice_windows_visible_until
  ON public.user_rejection_notice_windows (visible_until);

ALTER TABLE public.user_rejection_notice_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_rejection_notice_windows_select_own_authenticated ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_select_own_authenticated
  ON public.user_rejection_notice_windows
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_rejection_notice_windows_insert_own_authenticated ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_insert_own_authenticated
  ON public.user_rejection_notice_windows
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_rejection_notice_windows_update_own_authenticated ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_update_own_authenticated
  ON public.user_rejection_notice_windows
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_rejection_notice_windows_select_service_role ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_select_service_role
  ON public.user_rejection_notice_windows
  FOR SELECT
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS user_rejection_notice_windows_insert_service_role ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_insert_service_role
  ON public.user_rejection_notice_windows
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS user_rejection_notice_windows_update_service_role ON public.user_rejection_notice_windows;
CREATE POLICY user_rejection_notice_windows_update_service_role
  ON public.user_rejection_notice_windows
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
