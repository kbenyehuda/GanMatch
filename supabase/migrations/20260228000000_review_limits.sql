-- Enforce max 10 total reviews per user (while still allowing edits via upsert).
-- Notes:
-- - We must not block INSERT ... ON CONFLICT DO UPDATE for an existing (user_id, gan_id).
-- - We use an advisory transaction lock per user_id to avoid race conditions.

CREATE OR REPLACE FUNCTION public.enforce_review_limit_10()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id uuid;
  v_count int;
BEGIN
  -- Serialize inserts per user to prevent racing past the limit.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text)::bigint);

  -- If this (user_id, gan_id) already exists, allow the insert attempt;
  -- the UNIQUE(user_id, gan_id) conflict path will convert it into an UPDATE.
  SELECT r.id
    INTO v_existing_id
  FROM public.reviews r
  WHERE r.user_id = NEW.user_id
    AND r.gan_id = NEW.gan_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)
    INTO v_count
  FROM public.reviews r
  WHERE r.user_id = NEW.user_id;

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'review_limit_reached'
      USING ERRCODE = 'P0001',
            DETAIL = 'max_reviews_per_user=10';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_review_limit_10 ON public.reviews;
CREATE TRIGGER trg_enforce_review_limit_10
BEFORE INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public.enforce_review_limit_10();

NOTIFY pgrst, 'reload schema';

