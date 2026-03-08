-- Enable user_inputs for Supabase Realtime so process_user_inputs.py --realtime can listen for new rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_inputs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inputs;
  END IF;
END $$;
