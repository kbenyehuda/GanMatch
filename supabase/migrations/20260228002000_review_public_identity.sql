-- Store public reviewer identity for non-anonymous reviews.
-- We intentionally store only a display name and a masked email to avoid leaking private emails.

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_public_name TEXT,
  ADD COLUMN IF NOT EXISTS reviewer_public_email_masked TEXT;

NOTIFY pgrst, 'reload schema';

