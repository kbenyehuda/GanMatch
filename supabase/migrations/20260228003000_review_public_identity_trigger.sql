-- Populate public reviewer identity fields for non-anonymous reviews.
-- This keeps the browser from needing access to auth.users, while still showing a useful label.
-- We only store a display name + masked email (no raw email).

CREATE OR REPLACE FUNCTION public.mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_local TEXT;
  v_domain TEXT;
  v_keep TEXT;
BEGIN
  IF p_email IS NULL OR POSITION('@' IN p_email) = 0 THEN
    RETURN NULL;
  END IF;

  v_local := SPLIT_PART(p_email, '@', 1);
  v_domain := SPLIT_PART(p_email, '@', 2);
  IF v_local IS NULL OR v_local = '' OR v_domain IS NULL OR v_domain = '' THEN
    RETURN NULL;
  END IF;

  v_keep := LEFT(v_local, CASE WHEN LENGTH(v_local) >= 2 THEN 2 ELSE 1 END);
  RETURN v_keep || '***@' || v_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_review_public_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  -- Anonymous: clear public identity
  IF NEW.is_anonymous IS TRUE THEN
    NEW.reviewer_public_name := NULL;
    NEW.reviewer_public_email_masked := NULL;
    RETURN NEW;
  END IF;

  -- Non-anonymous: best-effort fill from auth.users
  SELECT u.email, (u.raw_user_meta_data->>'full_name')
    INTO v_email, v_full_name
  FROM auth.users u
  WHERE u.id = NEW.user_id;

  IF NEW.reviewer_public_name IS NULL OR BTRIM(NEW.reviewer_public_name) = '' THEN
    NEW.reviewer_public_name := NULLIF(BTRIM(v_full_name), '');
  END IF;

  IF NEW.reviewer_public_email_masked IS NULL OR BTRIM(NEW.reviewer_public_email_masked) = '' THEN
    NEW.reviewer_public_email_masked := public.mask_email(v_email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_public_identity ON public.reviews;
CREATE TRIGGER trg_reviews_public_identity
BEFORE INSERT OR UPDATE
ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.set_review_public_identity();

-- Backfill existing non-anonymous reviews
UPDATE public.reviews
SET updated_at = updated_at
WHERE is_anonymous IS FALSE
  AND (reviewer_public_name IS NULL OR reviewer_public_email_masked IS NULL);

NOTIFY pgrst, 'reload schema';

