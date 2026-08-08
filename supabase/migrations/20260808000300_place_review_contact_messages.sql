-- Log "contact reviewer" messages for place_reviews (mirrors review_contact_messages,
-- which only covers the legacy confirmed_reviews/ganim_v2 flow).

CREATE TABLE IF NOT EXISTS public.place_review_contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_review_id UUID NOT NULL REFERENCES public.place_reviews(id) ON DELETE CASCADE,
  sender_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email TEXT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_review_contact_messages_place_review_id
  ON public.place_review_contact_messages (place_review_id);

CREATE INDEX IF NOT EXISTS idx_place_review_contact_messages_sender_user_id
  ON public.place_review_contact_messages (sender_user_id);

ALTER TABLE public.place_review_contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS place_review_contact_messages_insert ON public.place_review_contact_messages;
CREATE POLICY place_review_contact_messages_insert ON public.place_review_contact_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_user_id);

-- No SELECT policy: keep contents private (server can read with service role if needed).

NOTIFY pgrst, 'reload schema';
