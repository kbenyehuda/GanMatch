-- Log “contact reviewer” messages for audit and future rate-limiting.

CREATE TABLE IF NOT EXISTS public.review_contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  sender_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_email TEXT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_contact_messages_review_id
  ON public.review_contact_messages (review_id);

CREATE INDEX IF NOT EXISTS idx_review_contact_messages_sender_user_id
  ON public.review_contact_messages (sender_user_id);

ALTER TABLE public.review_contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS review_contact_messages_insert ON public.review_contact_messages;
CREATE POLICY review_contact_messages_insert ON public.review_contact_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = sender_user_id);

-- No SELECT policy: keep contents private (server can read with service role if needed).

NOTIFY pgrst, 'reload schema';

