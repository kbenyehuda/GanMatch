-- Minimal moderation audit fields for triage decisions.

ALTER TABLE public.user_inputs
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_inputs_reviewed_at ON public.user_inputs (reviewed_at DESC);

NOTIFY pgrst, 'reload schema';
