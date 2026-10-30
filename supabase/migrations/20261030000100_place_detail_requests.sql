-- "ערכו פרטים" for kids places: user edits wait for admin approval instead of
-- changing the place right away (user decision 2026-10-30; trust rules may come later).
-- Same shape as place_location_requests.

CREATE TABLE IF NOT EXISTS public.place_detail_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id           UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Only the fields the user changed, in the /api/places/kids-attributes body shape.
  changes            JSONB NOT NULL,
  -- The place's values for those same fields when the request was made.
  previous           JSONB,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderation_reason  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ,
  reviewed_by        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS place_detail_requests_status_idx
  ON public.place_detail_requests (status, created_at DESC);

ALTER TABLE public.place_detail_requests ENABLE ROW LEVEL SECURITY;

-- Inserts/admin reads+writes go through the API's service-role client; these
-- policies only cover a hypothetical direct client-side read/write.
CREATE POLICY place_detail_requests_insert_auth ON public.place_detail_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY place_detail_requests_select_own ON public.place_detail_requests
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
