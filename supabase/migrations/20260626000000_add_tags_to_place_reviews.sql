-- place_reviews.tags: freeform labels from WhatsApp LLM extraction.
-- Added defensively because this column was likely added directly in Supabase
-- before this migration existed.
ALTER TABLE public.place_reviews
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
