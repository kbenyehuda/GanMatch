# Database, migrations, and data pipelines

Use this when you need to **apply schema**, **understand tables**, or **run ingestion / materialization**. Day-to-day app development only needs valid Supabase env vars in `.env.local`.

## Applying migrations

1. Supabase Dashboard → **SQL Editor** (or Supabase CLI linked to the project).
2. Run everything under **`supabase/migrations/`** in **strict timestamp order** on a **fresh** project, starting from `20260227000000_initial_schema.sql`.

Notable additions (not a full list—follow the folder order):

- `20260228000000_review_limits.sql`, `20260228001000_review_contact_messages.sql`
- `ganim_v2`, RPC switch, `user_inputs`, `confirmed_reviews`, entitlements, telemetry (later timestamps)
- **`20260307100005_drop_old_tables.sql`** — drops legacy tables (`reviews`, `gan_edit_requests`, `gan_suggestions`, `visit_notes`, `waitlist_reports`) **after** you have migrated to **`user_inputs`** / **`confirmed_reviews`**. Only run when your data path matches that assumption.

**Optional dev seed:** `supabase/seed/seed_simulated_ganim.sql` targets legacy **`ganim`** if that table still exists; skip or adapt if you only use **`ganim_v2`**.

## Canonical tables (runtime)

- **`ganim_v2`** — Map RPCs read from here (`get_ganim_in_bbox`, `get_all_ganim`).
- **`user_inputs`** — Submissions (edits, reviews, suggests, …) with moderation **`status`**.
- **`confirmed_reviews`** — Public review rows (materialized from approved inputs).
- **`user_access_entitlements`**, **`user_onboarding_profiles`**, **`user_bounty_completions`**, **`telemetry_events`** — Give-to-Get (see [GIVE_TO_GET_ACCESS_MODEL.md](../GIVE_TO_GET_ACCESS_MODEL.md)).
- **`user_rejection_notice_windows`** — Per-user/gan notice after a rejected `user_inputs` row (client reads via Supabase in `GanDetail`).
- **`review_contact_messages`** — Audit log for contact-reviewer emails (server `POST /api/contact-reviewer` when enabled).

Retired surfaces and replacement notes: [graveyard/retired_tables_and_ledgers.md](./graveyard/retired_tables_and_ledgers.md). Old “initial schema creates ganim + reviews …” wording: [graveyard/legacy_readme_database_blurb.md](./graveyard/legacy_readme_database_blurb.md).

## Category model (ganim_v2)

Hebrew UI shows **סוג** plus **one** dependent field for the chosen category:

1. **מעון סמל** — `MAON_SYMBOL` + `maon_symbol_code`
2. **גן פרטי** — `PRIVATE_GAN` + `private_supervision`
3. **משפחתון** — `MISHPACHTON` + `mishpachton_affiliation`
4. **גן עירוני** — `MUNICIPAL_GAN` + `municipal_grade`

Backfill / inference from older text lives in migration `20260302006000_backfill_ganim_v2_from_metadata.sql`. RPCs read **`ganim_v2`** after `20260302005000_switch_rpcs_to_ganim_v2.sql`.

## Edits, triage, materialization

Plain-language picture: users submit changes into **`user_inputs`**. Some changes update the public daycare row (**`ganim_v2`**, what the map shows) right away; others wait for an admin or for a background script.

- **`POST /api/ganim/edit`** — Runs automated checks (`gan-edit-approval` → `validation-engine.ts`) and saves one row in **`user_inputs`** with `input_type = edit` (unless the patch is a no-op: **`skipInsert`** returns success **without** inserting **`user_inputs`** or touching entitlements).
  - **If the checks say “approved”** (trusted user, nothing too risky): the API **updates `ganim_v2` immediately** so the map/detail view can show the new price, hours, etc., without waiting for anything else.
  - **If the checks say “pending”**: the row stays “waiting for a human.” **The map is not updated by this request.** Later, when an admin approves it in triage, **`ganim_v2` is still not updated inside the triage API**—the Python script **`process_user_inputs.py`** (or realtime) picks up approved edits and applies them to **`ganim_v2`**. So: *auto-approved edit = instant map update; pending → approved in triage = map updates when the worker runs.*
  - With **`FF_SOFT_GATE`**: best-effort short **`full_access`** on submit when the user does not already have full access (**`source=bounty`**); if auto-moderation is **`approved`**, the same handler also grants long-lived **`full_access`** (**`ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS`**) after materializing **`ganim_v2`**. Details: [GIVE_TO_GET_ACCESS_MODEL.md](../GIVE_TO_GET_ACCESS_MODEL.md).

- **`POST /api/admin/triage/decision`** — Admin-only (`ADMIN_EMAILS`). Marks a **`user_inputs`** row approved or rejected and records **`reviewed_at` / `reviewed_by`**.
  - **Reviews:** on approve, the API **copies the review into `confirmed_reviews` right away** (so stars/text can show without the worker), **then** grants entitlement if **`FF_SOFT_GATE`**. If the grant step fails, the route may return **500** while the review is already public—operators should retry or fix ledger issues.
  - **Edits (triage approve):** **`user_inputs.status`** is set to **`approved`** before the entitlement grant runs. If **`FF_SOFT_GATE`** and the grant fails, the API may return **500** while the row is already approved; **`process_user_inputs`** can still merge the edit into **`ganim_v2`** (there is no automatic rollback).
  - **Suggest-a-gan:** on approve, toggles **`ganim_v2.is_verified`** for that suggestion.
  - **Edits:** on approve, **does not** apply the edited fields to **`ganim_v2`** (see above—that’s the worker’s job for edits that were pending).
  - With **`FF_SOFT_GATE`**, approving a review or edit can also grant **`full_access`** in the ledger (review uses `source=review`, edit uses `source=bounty` in code).

- **`scripts/user_inputs/process_user_inputs.py`** (or **`--realtime`**) — Background “catch-up”: creates rows from approved **`suggest_gan`**, **merges approved edits into `ganim_v2`**, writes **reviews / visit notes** into **`confirmed_reviews`** when they weren’t already written by triage, and applies **waitlist** reports to **`ganim_v2.vacancy_status`**.

- UI: **`/admin/triage`** calls these triage APIs.

## Suggest a gan (map)

- Client calls Supabase RPC **`suggest_gan`** (see migration `20260307100006_suggest_gan_to_user_inputs.sql`), which inserts **`user_inputs`** (`input_type` suggest flow) for the processor to create/update **`ganim_v2`**.

## App ↔ API flow (reviews and gate)

All routes live under `src/app/api/`.

| Step | Code path |
|------|-----------|
| Client gate state | `GET /api/entitlements/me` — returns `can_view_reviews`, defaults, `feature_flags`. If **`FF_SOFT_GATE`** is false, any authenticated user gets `can_view_reviews: true` without reading the ledger. |
| List reviews for a gan | `GET /api/reviews?gan_id=` — reads **`confirmed_reviews`** via service role; when **`FF_SOFT_GATE`**, enforces `getAccessSnapshot` and may **`consumeOneReviewQuota`**. |
| Submit review | `POST /api/reviews` — inserts **`user_inputs`** (`pending`); optional short **`full_access`** when gate on (see `GIVE_TO_GET_ACCESS_MODEL.md`). |
| Unlock bounty / onboarding | `POST /api/entitlements/unlock/bounty`, `POST /api/entitlements/unlock/onboarding` — require **`FF_SOFT_GATE`** and **`FF_BOUNTY_UNLOCK` / `FF_ONBOARDING_UNLOCK`**. |
| Unlock progress (UI) | `GET /api/entitlements/progress` — aggregates pending contributions for the modal. |

## Ingestion

- **Recommended (supervised maon):** [scripts/gov_import/README.md](../scripts/gov_import/README.md) → **`upsert_ganim_v2`**.
- **Legacy municipal scraper:** [scripts/scraper/README.md](../scripts/scraper/README.md) (often **`insert_gan`** / legacy **`ganim`**—verify before use if **`ganim`** was dropped).

## Processor

```bash
cd scripts/user_inputs
pip install supabase python-dotenv   # if needed
python process_user_inputs.py         # once
python process_user_inputs.py --watch # every 60s
python process_user_inputs.py --realtime  # needs realtime migration (e.g. 20260307100008)
```

Requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in repo-root `.env.local`.
