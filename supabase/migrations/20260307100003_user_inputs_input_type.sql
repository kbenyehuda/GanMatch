-- Add input_type and is_parent to user_inputs for flow distinction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_input_type') THEN
    CREATE TYPE public.user_input_type AS ENUM (
      'edit',
      'suggest_gan',
      'review',
      'visit_note',
      'waitlist_report'
    );
  END IF;
END $$;

ALTER TABLE public.user_inputs
  ADD COLUMN IF NOT EXISTS input_type public.user_input_type,
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN;

-- Backfill input_type from metadata.source for migrated rows
UPDATE public.user_inputs
SET input_type = CASE
  WHEN metadata->>'source' = 'gan_edit_requests' THEN 'edit'::public.user_input_type
  WHEN metadata->>'source' = 'gan_suggestions' THEN 'suggest_gan'::public.user_input_type
  WHEN metadata->>'source' = 'reviews' THEN 'review'::public.user_input_type
  WHEN metadata->>'source' = 'visit_notes' THEN 'visit_note'::public.user_input_type
  WHEN metadata->>'source' = 'waitlist_reports' THEN 'waitlist_report'::public.user_input_type
  ELSE NULL
END
WHERE input_type IS NULL AND metadata ? 'source';

UPDATE public.user_inputs SET is_parent = parent_in_gan WHERE is_parent IS NULL AND parent_in_gan IS NOT NULL;

NOTIFY pgrst, 'reload schema';
