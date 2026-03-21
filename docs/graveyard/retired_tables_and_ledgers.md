# Retired tables and ledgers (reference)

**Not runnable documentation.** Use `supabase/migrations/` for exact DDL and order. This page is a human map so we do not lose track of what existed and what replaced it.

## Folded into `user_inputs` + processor

| Retired surface | Replacement / notes |
|----------------|---------------------|
| `gan_edit_requests` | Edits logged as `user_inputs` with `input_type` / `metadata.source` (see migration `20260307100001`). Table dropped in `20260307100005_drop_old_tables.sql`. |
| `gan_suggestions` | New-gan suggestions → `user_inputs` (`suggest_gan`). |
| `visit_notes` | → `user_inputs` (`visit_note`), materialized into `confirmed_reviews` by `scripts/user_inputs/process_user_inputs.py`. |
| `waitlist_reports` | → `user_inputs` (`waitlist_report`), vacancy applied to `ganim_v2` by processor. |

## Reviews

| Retired / parallel | Canonical public reads |
|-------------------|-------------------------|
| `reviews` (legacy table) | **`confirmed_reviews`** (fed from approved `user_inputs` and/or backfill migrations). Dropped with `20260307100005` once migrated. |

## Daycare geometry

| Table | Role |
|-------|------|
| `ganim` (legacy) | Original import/scraper target; **`ganim_v2`** is canonical for the app RPCs. If `ganim` is dropped, replace **`insert_gan`** or use **`upsert_ganim_v2`**. |

## Still in use (do not confuse with retired)

- `user_inputs`, `ganim_v2`, `confirmed_reviews`
- `user_access_entitlements`, `user_onboarding_profiles`, `user_bounty_completions`, `telemetry_events`
- `user_rejection_notice_windows`
- `review_contact_messages` (contact-reviewer feature)
