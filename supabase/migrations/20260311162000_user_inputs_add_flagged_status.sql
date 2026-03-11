-- Add "flagged" moderation state for high-risk / noisy submissions.

ALTER TABLE public.user_inputs
  DROP CONSTRAINT IF EXISTS user_inputs_status_check;

ALTER TABLE public.user_inputs
  ADD CONSTRAINT user_inputs_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'flagged'));

CREATE INDEX IF NOT EXISTS idx_user_inputs_flagged_created_at
  ON public.user_inputs (created_at DESC)
  WHERE status = 'flagged';

NOTIFY pgrst, 'reload schema';
