-- Drop old tables after data has been migrated to user_inputs and confirmed_reviews.
-- Order matters: drop FKs first, then tables.

-- Drop gan_edit_requests (data migrated to user_inputs)
DROP TABLE IF EXISTS public.gan_edit_requests CASCADE;

-- Drop reviews (data in confirmed_reviews)
DROP TABLE IF EXISTS public.reviews CASCADE;

-- Drop gan_suggestions (data migrated to user_inputs)
DROP TABLE IF EXISTS public.gan_suggestions CASCADE;

-- Drop visit_notes (data migrated to user_inputs)
DROP TABLE IF EXISTS public.visit_notes CASCADE;

-- Drop waitlist_reports (data migrated to user_inputs)
DROP TABLE IF EXISTS public.waitlist_reports CASCADE;

NOTIFY pgrst, 'reload schema';
