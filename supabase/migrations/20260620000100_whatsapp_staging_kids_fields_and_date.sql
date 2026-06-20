-- whatsapp_import_staging has no prior migration in this repo (created directly
-- in Supabase) — use defensive ADD COLUMN IF NOT EXISTS throughout.

-- Structured kids-category fields the triage LLM can fill alongside freeform tags.
ALTER TABLE public.whatsapp_import_staging
  ADD COLUMN IF NOT EXISTS kosher public.kosher_status,
  ADD COLUMN IF NOT EXISTS hours TEXT,
  ADD COLUMN IF NOT EXISTS friday_schedule TEXT,
  ADD COLUMN IF NOT EXISTS has_mamad BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_cctv BOOLEAN;

-- Date the WhatsApp message was actually sent (recommendation message, not the
-- source question), as opposed to created_at which is import time.
ALTER TABLE public.whatsapp_import_staging
  ADD COLUMN IF NOT EXISTS message_date DATE;

NOTIFY pgrst, 'reload schema';
