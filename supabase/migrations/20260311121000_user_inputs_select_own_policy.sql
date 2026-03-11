-- Allow authenticated users to read only their own user_inputs rows.
-- Needed for showing "pending verification" state after page refresh.

DROP POLICY IF EXISTS user_inputs_select_own_authenticated ON public.user_inputs;
CREATE POLICY user_inputs_select_own_authenticated ON public.user_inputs
  FOR SELECT
  USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
