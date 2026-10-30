-- The public API (anon / authenticated) may read every place_reviews column except the two that
-- identify or link the writer: user_id (would link all reviews by the same person) and
-- whatsapp_reviewer_name (the WhatsApp sender's code). The app reads reviews through
-- /api/place-reviews with the service role and returns only is_mine.
--
-- Apply only AFTER the code that stops selecting user_id with the anon key is live,
-- otherwise the reviews list on the live site fails.

revoke select on public.place_reviews from anon, authenticated;

grant select (
  id, place_id, rating, text, photos, tags,
  is_anonymous, allow_contact, reviewer_public_name, reviewer_public_email_masked,
  created_at, updated_at
) on public.place_reviews to anon, authenticated;
