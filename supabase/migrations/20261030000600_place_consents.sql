-- Consent to be listed, for private people (babysitters, caregivers) (user, 2026-10-30).
-- The proof itself stays where it arrived (her email, or a WhatsApp screenshot in her private
-- drive); this table records who, how to reach them, what they answered and where the proof is.
-- RLS on with no policies: only the service role (the /admin/consents API) reads or writes it.

create table if not exists public.place_consents (
  place_id    uuid primary key references public.places(id) on delete cascade,
  contact     text,           -- email or phone to ask them (private, never shown on the site)
  status      text not null default 'not_asked' check (status in ('not_asked', 'asked', 'given', 'refused')),
  asked_at    timestamptz,
  answered_at timestamptz,
  proof       text,           -- where the proof is, e.g. "Gmail, label הסכמות, 2.11.2026"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.place_consents enable row level security;
revoke all on public.place_consents from anon, authenticated;

-- Everyone hidden today is waiting to be asked
insert into public.place_consents (place_id)
select id from public.places where is_hidden
on conflict (place_id) do nothing;
