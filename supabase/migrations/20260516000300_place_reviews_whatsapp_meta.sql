-- Store real WhatsApp contact name for imported reviews.
-- Publicly we show 'חבר/ה מהשכונה'; this column keeps the source name for potential future use.
ALTER TABLE public.place_reviews
  ADD COLUMN IF NOT EXISTS whatsapp_reviewer_name TEXT;

NOTIFY pgrst, 'reload schema';
