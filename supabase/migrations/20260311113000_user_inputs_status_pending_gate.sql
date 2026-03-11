-- Add moderation status lifecycle to user_inputs.
-- Existing rows are marked approved to preserve current visible data.
-- New rows default to pending and require explicit approval before materialization.

ALTER TABLE public.user_inputs
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE public.user_inputs
SET status = 'approved'
WHERE status IS NULL;

ALTER TABLE public.user_inputs
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.user_inputs
  DROP CONSTRAINT IF EXISTS user_inputs_status_check;

ALTER TABLE public.user_inputs
  ADD CONSTRAINT user_inputs_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_user_inputs_status ON public.user_inputs (status);
CREATE INDEX IF NOT EXISTS idx_user_inputs_pending_created_at
  ON public.user_inputs (created_at DESC)
  WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
