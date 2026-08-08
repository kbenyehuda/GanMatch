-- Manual location-change requests for places.
--
-- Mirrors the ganim_v2 give-to-get pattern: a logged-in user can propose a new
-- pin location for an existing place; an admin approves/rejects before the
-- place's actual location changes. Applying an approved request reuses the
-- existing update_place_location(p_id, p_lat, p_lon) RPC (added in
-- 20260626000100_nullable_places_location.sql).

CREATE TABLE IF NOT EXISTS public.place_location_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id           UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  requested_lat      DOUBLE PRECISION NOT NULL,
  requested_lon      DOUBLE PRECISION NOT NULL,
  requested_address  TEXT,
  note               TEXT,

  -- Snapshot of the place's location at request time, for admin diffing.
  previous_lat       DOUBLE PRECISION,
  previous_lon       DOUBLE PRECISION,
  previous_address   TEXT,

  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderation_reason  TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ,
  reviewed_by        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_place_location_requests_place  ON public.place_location_requests (place_id);
CREATE INDEX IF NOT EXISTS idx_place_location_requests_status ON public.place_location_requests (status);
CREATE INDEX IF NOT EXISTS idx_place_location_requests_user   ON public.place_location_requests (user_id);

ALTER TABLE public.place_location_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS place_location_requests_insert_auth ON public.place_location_requests;
DROP POLICY IF EXISTS place_location_requests_select_own  ON public.place_location_requests;

-- Inserts/admin reads+writes go through the API's service-role client; these
-- policies only cover a hypothetical direct client-side read/write.
CREATE POLICY place_location_requests_insert_auth ON public.place_location_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY place_location_requests_select_own ON public.place_location_requests
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
