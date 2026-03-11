-- Revert moderation statuses to 3-state model:
-- approved | pending | rejected
-- Any previously flagged rows are mapped back to pending.

UPDATE public.user_inputs
SET status = 'pending'
WHERE status = 'flagged';

ALTER TABLE public.user_inputs
  DROP CONSTRAINT IF EXISTS user_inputs_status_check;

ALTER TABLE public.user_inputs
  ADD CONSTRAINT user_inputs_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

DROP INDEX IF EXISTS idx_user_inputs_flagged_created_at;

NOTIFY pgrst, 'reload schema';
