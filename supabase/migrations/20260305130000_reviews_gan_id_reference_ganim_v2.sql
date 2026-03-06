-- Change reviews.gan_id to reference ganim_v2 instead of ganim.
-- This allows reviews for ganim that were added via upsert_ganim_v2 (gov import)
-- and only exist in ganim_v2.

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_gan_id_fkey;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_gan_id_fkey
  FOREIGN KEY (gan_id) REFERENCES public.ganim_v2(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
