-- Backfill submitter email on existing user_inputs rows.
-- Useful for admin triage display and future reputation/engagement logic.

UPDATE public.user_inputs ui
SET email = au.email
FROM auth.users au
WHERE ui.user_id = au.id
  AND (ui.email IS NULL OR btrim(ui.email) = '');

