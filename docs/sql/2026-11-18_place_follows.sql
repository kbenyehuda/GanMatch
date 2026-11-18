-- Saved places (the ❤️) for signed-in people, plus an email-alerts switch per place.
-- Decisions 2026-11-18: one button (❤️ + "עדכונים במייל" switch), switch OFF by default,
-- guests keep saving in the browser only. Run once in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.place_follows (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id      UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  -- off until the person turns it on (Israeli spam law: explicit opt-in)
  email_alerts  BOOLEAN NOT NULL DEFAULT FALSE,
  -- when they opted in: kept as proof of consent
  alerts_opted_in_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, place_id)
);

CREATE INDEX IF NOT EXISTS place_follows_place_idx  ON public.place_follows (place_id);
CREATE INDEX IF NOT EXISTS place_follows_alerts_idx ON public.place_follows (place_id) WHERE email_alerts;

ALTER TABLE public.place_follows ENABLE ROW LEVEL SECURITY;
-- All writes go through the API's service-role client; a person may read only their own rows.
DROP POLICY IF EXISTS place_follows_select_own ON public.place_follows;
CREATE POLICY place_follows_select_own ON public.place_follows
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
