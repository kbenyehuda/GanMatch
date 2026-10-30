-- Automatic check of recommendations written in the app (src/lib/review-check.ts).
-- check_status: 'auto_ok' (passed the check), 'held' (waits in /admin/held-reviews), 'approved' (an admin
-- approved a held one); null for WhatsApp recommendations, which were approved one by one in triage.
-- hold_reasons: the HoldReason codes for a held review.

alter table public.place_reviews add column if not exists check_status text
  check (check_status in ('auto_ok', 'held', 'approved'));
alter table public.place_reviews add column if not exists hold_reasons text[];

-- The 43 negatives hidden earlier today wait in the same admin list
update public.place_reviews
set check_status = 'held', hold_reasons = array['low_rating']
where is_hidden and check_status is null;
