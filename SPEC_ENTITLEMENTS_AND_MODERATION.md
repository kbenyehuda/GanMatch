# Spec: Entitlements and Moderation

> ### Read this first — this file is **not normative**
>
> **Normative = “what production must do.”** This document is **mostly target design, backlog, and naming history**. It is **easy to misread** if you skim tables or flag names and assume they match the database or `src/`.
>
> **If you need the real product contract for behavior and schema, use (in order):**
> 1. **[GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md)** — access economics, flags, ledger, API paths.
> 2. **[docs/database.md](docs/database.md)** — tables, migrations, edit/triage/materialization, API ↔ DB flow.
> 3. **`supabase/migrations/`** and **`src/`** — ground truth when docs disagree.
>
> **Parts B, C (wish-list portions), D, and E below are explicitly non-normative** unless a subsection is labeled **Shipped**. Part A is **mixed** (each subsection says what is shipped vs target).

Engineering **target** specification for moderation workflow and Give-to-Get soft-gating. **Do not treat the whole file as implementation instructions.**

## Status (vs codebase)

**This file is non-normative except where a paragraph is explicitly labeled “Shipped.”**

**Implemented (partial or full):** `user_inputs` lifecycle and moderation fields, `POST /api/ganim/edit` → `user_inputs` (with optional immediate `ganim_v2` update when approved), `POST /api/admin/triage/decision`, `/admin/triage` UI, `GET/POST` review and entitlement routes, bounty + onboarding unlock POST handlers, `telemetry_events` for key funnel events. **Normative description of what shipped:** [GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md) and [docs/database.md](docs/database.md).

**Master switch:** `FF_SOFT_GATE` in `src/lib/env/server.ts`. When **`false`**, `GET /api/reviews` skips entitlement checks (any logged-in user); bounty/onboarding **POST** unlock routes return 403. When **`true`**, ledger + quota behavior matches the access model doc. **`FF_ONBOARDING_UNLOCK`** is special-cased: if unset, the server treats it as **on** (see `server.ts`); set `FF_ONBOARDING_UNLOCK=false` to disable.

**Not implemented as specified here:** `referral_codes` / `referral_events`, `moderation_events`, explicit `day_pass` entitlement type in DB (schema uses `full_access` and `review_quota` today). Rollout flags in Part D (`FF_MODERATION_STATUS`, etc.) differ from shipped names (`FF_SOFT_GATE`, `FF_BOUNTY_UNLOCK`, …). **`user_inputs` audit columns:** production uses **`reviewed_at` / `reviewed_by`** (see migration `20260311132000_user_inputs_moderation_fields.sql`), not the spec’s `approved_by` / `approved_at` naming. **`risk_score`:** no column in current migrations; moderation stores string reason codes in **`moderation_reason`** for edits.

**This file** remains **design backlog and vocabulary** for the next iteration. It is **not** the authority on what is deployed.

## Objectives

- Prevent unsafe/untrusted public data changes.
- Allow first-time parents to unlock value through multiple valid contributions.
- Make access decisions explicit, testable, and auditable.

## Non-Goals (v1)

- Full ML moderation.
- Complex role/permission hierarchy beyond admin + regular users.
- Full BI platform; only essential event instrumentation.

---

## Part A: Moderation Workflow

**Mixed normativity:** subsections label **Shipped** vs **Target** / **Optional (not built)**. Unlabeled bullets under “Target” are **not** production requirements.

## A1. Data Model Changes

### Table: `user_inputs` (extend)

**Shipped (production):** `status` (`pending` | `approved` | `rejected`), `moderation_reason`, `reviewed_at`, `reviewed_by` — see migrations from `20260311113000_user_inputs_status_pending_gate.sql` and `20260311132000_user_inputs_moderation_fields.sql`. Edit auto-moderation yields only **`approved`** or **`pending`**; **`rejected`** is set through admin triage, not the validation engine.

**Target design (not fully reflected in DB / API yet):** below retains the original spec shape for forward planning. Where names differ, production uses **`reviewed_*`** instead of **`approved_*`**, and there is **no `risk_score` column** yet (scores could live in metadata later).

- `status` text not null default `'pending'`
  - allowed values: `pending`, `approved`, `rejected`
- `risk_score` numeric null — **future / not migrated**
- `moderation_reason` text null — **shipped** (edit path: comma-separated reason codes)
- `reviewed_by` uuid null — **shipped** (spec originally: `approved_by`)
- `reviewed_at` timestamptz null — **shipped** (spec originally: `approved_at`)
- `rejected_by` uuid null — **not in current migrations** (rejections recorded via `reviewed_*` + `status=rejected` today)
- `rejected_at` timestamptz null — **not in current migrations**

### Optional Table: `moderation_events` _(target — not in production)_
- `id` uuid pk
- `user_input_id` uuid not null
- `event_type` text not null (`submitted`, `auto_flagged`, `approved`, `rejected`)
- `actor_user_id` uuid null
- `metadata` jsonb null
- `created_at` timestamptz not null default now()

## A2. Approval Policy (v1) _(target API shape; shipped engine differs on `reject`)_

Function contract:
- input: `{ userId, ganId, patch }`
- output:
  - `{ decision: "approve", riskScore, reasonCodes[] }`
  - `{ decision: "pending", riskScore, reasonCodes[] }`
  - `{ decision: "reject", riskScore, reasonCodes[] }`

**Shipped edits:** the validation engine never emits `reject`—high-risk signals map to **`pending`** for human triage; only triage sets `status=rejected`.

Checks:
- Text blacklist/profanity.
- Diff threshold checks:
  - price delta over threshold
  - location shift over threshold
- Reputation checks:
  - trusted contributors can auto-approve low-risk edits
  - new/untrusted users default to pending for medium/high risk

Reason code examples:
- `BLACKLIST_MATCH`
- `PRICE_DELTA_HIGH`
- `LOCATION_DELTA_HIGH`
- `NEW_USER_REVIEW_REQUIRED`
- `LOW_RISK_TRUSTED_USER`

## A3. API Behavior

### `POST /api/ganim/edit`
- Validate/authenticate request.
- Run approval policy.
- Write to `user_inputs` with returned `status`, `moderation_reason` (reason codes; **no `risk_score` column**).
- Return response:
  - `status: approved|pending` only from auto-moderation; **`rejected`** is not produced by this route’s engine
  - user-facing message

### Materialization Processor
- Only materialize rows with `status = 'approved'`.
- Skip pending/rejected rows.
- Idempotent by input id.

## A4. UX Behavior _(target / product intent)_

- Submitter sees immediate local confirmation + badge:
  - approved: "Published"
  - pending: "Pending verification"
  - rejected: "Needs correction"
- Public views should never show pending/rejected changes.

## A5. Admin Triage

Route: `/admin/triage`

**Shipped (`GET /api/admin/triage`):**
- List: items for the requested **`status`** (default `pending`), ordered by **`created_at` descending** (newest first)—not by a numeric risk score.
- Row details: field diffs (old → new), submitter id, **`moderation_reason`** (reason codes), per-user engagement counts from **`user_inputs`**. There is **no `risk_score` column** in production (see banner at top).

**Target (forward-looking):**
- Sort/filter by modeled risk and age; show explicit risk score in the row UI.

**Actions (shipped):**
- Approve / reject via **`POST /api/admin/triage/decision`** (sets status, **`reviewed_at` / `reviewed_by`**, optional moderation reason).

---

## Part B: Entitlements and Soft Gate

> **Non-normative — target / backlog.** The tables, entitlement types (`day_pass`), and referral model below are **not** a checklist of what exists in Postgres today. **Shipped** access rules, flags, and tables: **[GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md)**.

## B1. Data Model _(target)_

### Table: `user_access_entitlements`
- `id` uuid pk
- `user_id` uuid not null
- `entitlement_type` text not null
  - `full_access`, `day_pass`, `review_quota`
- `source` text not null
  - `review`, `bounty`, `referral`, `onboarding`, `admin`
- `starts_at` timestamptz not null
- `expires_at` timestamptz null
- `quota_remaining` int null
- `metadata` jsonb null
- `created_at` timestamptz not null default now()

### Table: `referral_codes` _(target — not migrated)_
- `code` text pk
- `owner_user_id` uuid not null
- `max_uses` int null
- `uses_count` int not null default 0
- `created_at` timestamptz not null default now()

### Table: `referral_events` _(target — not migrated)_
- `id` uuid pk
- `code` text not null
- `invited_user_id` uuid not null
- `qualifying_action` text null
- `qualified_at` timestamptz null
- `unlock_granted_at` timestamptz null
- `created_at` timestamptz not null default now()

## B2. Capability Rule _(target pseudo-code)_

Replace login-based check with capability-based check.

Pseudo-logic:

```ts
function canViewReviews(user: User | null): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (hasActiveEntitlement(user.id, "full_access")) return true;
  if (hasActiveEntitlement(user.id, "day_pass")) return true; // optional future type; not in current DB CHECK
  if (hasQuota(user.id, "review_quota")) return true;
  return false;
}
```

## B3. Unlock Paths (v1) _(product intent; see access model for what is live)_

1) **Experienced Parent**
- Action: submits accepted quality review.
- Reward: full access entitlement (time-boxed).

2) **First-Time Parent: Bounty**
- Action: completes N verified micro-tasks.
- Reward: **`full_access`** for a configured duration in current implementation (see `GIVE_TO_GET_ACCESS_MODEL.md`). A separate short-lived **`day_pass`** type was considered in this spec but is not the shipped bounty reward.

3) **Referral Path**
- Action: invitee signs up and completes qualifying action.
- Reward: entitlement for inviter.

4) **Onboarding Path (optional in v1)**
- Action: complete profile context.
- Reward: limited review quota.

## B4. Locked State UX _(target UX)_

When user is blocked from full review visibility:
- Show modal with three action cards:
  - "I was a parent here" -> review flow
  - "I am searching for first gan" -> bounty flow
  - "Invite and unlock" -> referral flow
- Always show expected reward clearly (what unlocks and for how long).

## B5. Abuse Prevention _(target / backlog)_

- Rate limit unlock attempts per day.
- Require qualifying thresholds for referral unlocks.
- Deny duplicate self-referrals and suspicious patterns.
- Keep audit trail for entitlement grants.

---

## Part C: Events and Telemetry

> **Mixed.** The **wish-list** event names below are **not** all implemented or client-allowed. **Shipped** allowlist and server behavior are spelled out in the paragraph after the list. Do **not** assume analytics or code emit every name in the wish list.

**Minimum events (target / product wish list — not normative):**
- `lock_wall_viewed`
- `unlock_path_selected`
- `contribution_submitted`
- `contribution_approved`
- `entitlement_granted`
- `review_viewed`
- `moderation_pending_created`
- `moderation_decision_made`

**Shipped client allowlist** (`POST /api/telemetry/track`): `lock_wall_viewed`, `unlock_path_selected`, `contribution_submitted`, `contribution_approved`, `entitlement_granted`, `review_viewed`, `quota_consumed`. **`moderation_pending_created`** and **`moderation_decision_made`** are **not** accepted from the client today. The server also writes events directly (e.g. `quota_consumed`, `entitlement_granted`) from API routes.

**Required properties (target schema — non-normative):**
- `user_id`
- `path` (`review|bounty|referral|onboarding`)
- `source_surface` (where lock wall was shown)
- `entity_id` (`gan_id`, `user_input_id`, `referral_code`)
- `timestamp`

---

## Part D: Rollout Plan

> **Non-normative — historical / aspirational.** Flag names and phases **do not** match a single enforced rollout doc in the repo. **Shipped** flags live in **`src/lib/env/server.ts`** and **`.env.example`** (e.g. `FF_SOFT_GATE`, not `FF_MODERATION_STATUS`).

## Phase 0 (feature flags) _(target sketch)_
- `FF_MODERATION_STATUS`
- `FF_SOFT_GATE`
- `FF_BOUNTY_UNLOCK`
- `FF_REFERRAL_UNLOCK`

## Phase 1 _(target sketch)_
- Enable moderation statuses and pending UX.
- Keep old review gate in parallel as fallback.

## Phase 2 _(target sketch)_
- Enable capability gate for subset of users (e.g., 10%).
- Compare funnel and moderation metrics.

## Phase 3 _(target sketch)_
- Ramp to 100% after KPI and quality checks pass.

---

## Part E: Acceptance Criteria

> **Non-normative — definition of done for a future milestone**, not a guarantee of current QA status. Use tests, staging, and the two normative docs for “what passes today.”

**Moderation (target criteria):**
- All new submissions persisted with explicit status.
- Materializer ignores non-approved rows.
- Admin can approve/reject from triage.

**Entitlements (target criteria):**
- Review visibility uses capability gate (not just auth).
- At least one non-review unlock path is live.
- Entitlements created and consumed correctly with expiry/quota rules.

**Observability (target criteria):**
- Core events emitted reliably.
- Weekly dashboard supports funnel + moderation decisions.

