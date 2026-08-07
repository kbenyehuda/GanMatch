-- trg_place_stats only fired on INSERT/DELETE, so it silently missed two real
-- cases: (1) editing an existing review's rating never updated the place's
-- avg_rating, and (2) reassigning a review's place_id (e.g. merging duplicate
-- places) left both the old and new place's stats stale. Discovered while
-- manually merging duplicate WhatsApp-sourced places (2026-08-07).

CREATE OR REPLACE FUNCTION public.update_place_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.places SET
      avg_rating = (SELECT AVG(rating)::FLOAT4 FROM public.place_reviews WHERE place_id = OLD.place_id),
      rec_count  = (SELECT COUNT(*)::INT       FROM public.place_reviews WHERE place_id = OLD.place_id),
      updated_at = NOW()
    WHERE id = OLD.place_id;
    RETURN OLD;
  END IF;

  -- On UPDATE where place_id changed, the old place also loses a review.
  IF TG_OP = 'UPDATE' AND OLD.place_id IS DISTINCT FROM NEW.place_id THEN
    UPDATE public.places SET
      avg_rating = (SELECT AVG(rating)::FLOAT4 FROM public.place_reviews WHERE place_id = OLD.place_id),
      rec_count  = (SELECT COUNT(*)::INT       FROM public.place_reviews WHERE place_id = OLD.place_id),
      updated_at = NOW()
    WHERE id = OLD.place_id;
  END IF;

  UPDATE public.places SET
    avg_rating = (SELECT AVG(rating)::FLOAT4 FROM public.place_reviews WHERE place_id = NEW.place_id),
    rec_count  = (SELECT COUNT(*)::INT       FROM public.place_reviews WHERE place_id = NEW.place_id),
    updated_at = NOW()
  WHERE id = NEW.place_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_place_stats ON public.place_reviews;
CREATE TRIGGER trg_place_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.place_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_place_stats();

NOTIFY pgrst, 'reload schema';
