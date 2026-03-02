-- Log gan edit requests (even if auto-approved for now).

CREATE TABLE IF NOT EXISTS public.gan_edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gan_id UUID NOT NULL REFERENCES public.ganim(id) ON DELETE CASCADE,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  patch JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gan_edit_requests_gan_id ON public.gan_edit_requests (gan_id);
CREATE INDEX IF NOT EXISTS idx_gan_edit_requests_created_at ON public.gan_edit_requests (created_at DESC);

ALTER TABLE public.gan_edit_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gan_edit_requests_select ON public.gan_edit_requests;
CREATE POLICY gan_edit_requests_select ON public.gan_edit_requests
  FOR SELECT USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS gan_edit_requests_insert_service_role ON public.gan_edit_requests;
CREATE POLICY gan_edit_requests_insert_service_role ON public.gan_edit_requests
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';

