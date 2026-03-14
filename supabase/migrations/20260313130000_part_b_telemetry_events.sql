-- Part B minimal telemetry events for unlock funnel measurement.

CREATE TABLE IF NOT EXISTS public.telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  path TEXT NULL,
  source_surface TEXT NULL,
  entity_id TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_name_created_at
  ON public.telemetry_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_user_created_at
  ON public.telemetry_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_path_created_at
  ON public.telemetry_events (path, created_at DESC);

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telemetry_events_insert_service_role ON public.telemetry_events;
CREATE POLICY telemetry_events_insert_service_role
  ON public.telemetry_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS telemetry_events_select_service_role ON public.telemetry_events;
CREATE POLICY telemetry_events_select_service_role
  ON public.telemetry_events
  FOR SELECT
  USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
