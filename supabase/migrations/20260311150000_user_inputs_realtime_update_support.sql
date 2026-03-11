-- Ensure Realtime can stream UPDATE events for user_inputs.
-- This is required so triage approval (status -> approved) triggers the Python realtime worker.

ALTER TABLE public.user_inputs REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- Ensure publication includes update events (some environments may drift).
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime SET (publish = 'insert, update, delete, truncate');
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not alter publication supabase_realtime due to privileges. Configure publish events in Supabase dashboard.';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_inputs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_inputs;
  END IF;
END $$;
