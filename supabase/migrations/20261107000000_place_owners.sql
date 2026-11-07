-- "זה העסק שלכם?" (user decisions 2026-11-07).
-- An owner asks in the app; the admin verifies by phone (no documents are stored, only a note
-- saying how it was verified) and approves. One place can have several owners, one person several places.
-- Approved owners' edits go live at once, and still show in the admin queue with an undo.

CREATE TABLE IF NOT EXISTS public.place_owner_claims (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id           UUID NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  -- SET NULL, not CASCADE: the history stays if the account is deleted (lawyer list).
  user_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name          TEXT NOT NULL,
  role               TEXT,
  phone              TEXT NOT NULL,
  note               TEXT,
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'revoked')),
  -- How the admin verified it, e.g. "אומת בטלפון שברישום". Never the document itself.
  verification_note  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at         TIMESTAMPTZ,
  decided_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- One open (pending or approved) claim per person per place
CREATE UNIQUE INDEX IF NOT EXISTS place_owner_claims_open_uniq
  ON public.place_owner_claims (place_id, user_id) WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS place_owner_claims_user_idx   ON public.place_owner_claims (user_id);
CREATE INDEX IF NOT EXISTS place_owner_claims_status_idx ON public.place_owner_claims (status, created_at DESC);

ALTER TABLE public.place_owner_claims ENABLE ROW LEVEL SECURITY;
-- All reads/writes go through the API's service-role client; a user may read only their own.
CREATE POLICY place_owner_claims_select_own ON public.place_owner_claims
  FOR SELECT USING (auth.uid() = user_id);

-- Owner edits applied without waiting: marked, and undoable from the queue.
ALTER TABLE public.place_detail_requests
  ADD COLUMN IF NOT EXISTS auto_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reverted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Owner edits stay in the "ממתינות" queue until the admin marks them seen (or undoes them)
  ADD COLUMN IF NOT EXISTS admin_seen_at TIMESTAMPTZ;

-- When a recommendation went public (auto-check passed or admin approved). Old rows: created_at.
ALTER TABLE public.place_reviews ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
UPDATE public.place_reviews SET approved_at = created_at WHERE approved_at IS NULL AND is_hidden = FALSE;

-- Keep who-did-what history when an account is deleted: unlink the person instead of deleting rows.
ALTER TABLE public.place_detail_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.place_detail_requests DROP CONSTRAINT IF EXISTS place_detail_requests_user_id_fkey;
ALTER TABLE public.place_detail_requests
  ADD CONSTRAINT place_detail_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.place_location_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.place_location_requests DROP CONSTRAINT IF EXISTS place_location_requests_user_id_fkey;
ALTER TABLE public.place_location_requests
  ADD CONSTRAINT place_location_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- place_reviews keeps ON DELETE CASCADE: /privacy §9 promises a deleted account's reviews are deleted.

-- Ownership requests are kept while the ownership is active, and up to a year after a request
-- was declined or an ownership was revoked (/privacy §8).
create or replace function public.retention_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.place_review_contact_messages where created_at < now() - interval '12 months';
  delete from public.place_detail_requests   where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  delete from public.place_location_requests where status <> 'pending' and coalesce(reviewed_at, created_at) < now() - interval '1 year';
  delete from public.telemetry_events where created_at < now() - interval '12 months';
  delete from public.place_owner_claims     where status in ('declined', 'revoked') and coalesce(decided_at, created_at) < now() - interval '1 year';
$$;
revoke all on function public.retention_cleanup() from public, anon, authenticated;

-- Owner pin moves go live too (decision 2026-11-07), with the same undo / seen markers.
ALTER TABLE public.place_location_requests
  ADD COLUMN IF NOT EXISTS auto_applied  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reverted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reverted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_seen_at TIMESTAMPTZ;

-- Account deletion like Instagram/Facebook (decision 2026-11-07): requested in the app, a 30-day
-- grace period during which signing in can cancel, then deleted automatically by the daily job.
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL so the row survives as a record that the deletion happened
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- true: recommendations stay, anonymous ("חבר/ה מהשכונה"); false: deleted at once
  keep_reviews    BOOLEAN NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  cancelled_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_open_uniq
  ON public.account_deletion_requests (user_id) WHERE cancelled_at IS NULL AND completed_at IS NULL;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_deletion_requests_select_own ON public.account_deletion_requests
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
