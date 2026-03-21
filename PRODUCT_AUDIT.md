# GanMatch Product Audit and Action Plan

This document captures the current product audit and proposed fixes so we can iterate over time.

**Other docs:** [docs/README.md](docs/README.md) · **Access model:** [GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md) · **Archived roadmaps:** [docs/graveyard/](docs/graveyard/)

## Why This Exists

- Keep one source of truth for product quality gaps.
- Separate urgent trust/safety issues from growth/UX improvements.
- Track critical fixes without losing important and nice-to-have ideas.

## Prioritization Framework

- **Critical**: Trust, safety, legal/compliance, data integrity, or core value loop broken.
- **Important**: Material UX/conversion/retention improvements that increase product success.
- **Nice to Have**: Polish, optimizations, and secondary enhancements.

---

## Critical Issues

### C1) Give-to-Get still has product gaps (entitlements vs open read)
- **Current state (2026)**: When **`FF_SOFT_GATE`** is enabled, review visibility uses **entitlements** (`full_access`, `review_quota`) plus onboarding and bounty paths—see `src/lib/entitlements/service.ts` and `GIVE_TO_GET_ACCESS_MODEL.md`. When **`FF_SOFT_GATE`** is off (default in `.env.example`), any **logged-in** user can read reviews without ledger checks; bounty/onboarding unlock **POST** routes still return 403.
- **Remaining risk**: Referral path is still placeholder; economics and copy may not match parent expectations; cold-start areas still feel empty.
- **Owner**: Product + Eng
- **Status**: In progress

### C2) Moderation coverage and operator load
- **Current state**: `POST /api/ganim/edit` runs `src/lib/moderation/validation-engine.ts` (driven by `config/moderation.json` and `MODERATION_*` env fallbacks). The engine returns only **`approved`** or **`pending`** (`GanEditModerationDecision`); it does **not** auto-**`reject`**. **`rejected`** is applied via **`/admin/triage`**. Patches can be **`pending`** (blacklist, large price/location deltas, invalid hours/phone, rate limits, low reputation, and many “reason” signals) or **`approved`** when the user is trusted (e.g. enough approved edits or trusted OAuth provider) and no hard flags fired. Auto-approved edits materialize to **`ganim_v2`** immediately; pending rows wait for triage (or the background processor for some paths).
- **Risk**: Trusted cohorts still auto-approve low-friction edits; triage throughput and policy tuning remain important for abuse and data quality.
- **Owner**: Product + Eng
- **Status**: Open

### C3) Materialization dependency is opaque to users
- **Current state**: Submissions land in **`user_inputs`**. **Auto-approved** edits are written to **`ganim_v2`** immediately in `POST /api/ganim/edit`. **Triage-approved** reviews upsert **`confirmed_reviews`** in `POST /api/admin/triage/decision`. Other approved rows (and anything the API does not fast-path) still rely on **`scripts/user_inputs/process_user_inputs.py`** (or equivalent) to show up consistently everywhere.
- **Risk**: Users can still misunderstand “saved” vs “visible on the map / in averages” for **pending** rows or paths that only the worker handles.
- **Owner**: Eng
- **Status**: Open

### C4) Missing strong anti-abuse controls for UGC
- **Current state**: Limited visible safeguards in current pipeline.
- **Risk**: Spam, low-quality submissions, manipulation.
- **Owner**: Product + Eng
- **Status**: Open

### C5) Missing baseline trust/legal product surfaces
- **Current state**: No explicit in-app legal/trust pages in app shell.
- **Risk**: Compliance and user trust gap for sensitive decision category.
- **Owner**: Product
- **Status**: Open

---

## Important Issues (Backlog)

### Discovery and Conversion
- Shallow onboarding for high-consideration childcare decisions.
- No shortlist/favorites/compare workflow.
- No structured parent journey tracking (contacted, toured, applied, enrolled).
- No lifecycle loop (saved search, alerts for updates/vacancy/reviews).

### Trust and Quality
- Admin triage exists (`/admin/triage`); throughput, SLA, and reviewer tooling still thin.
- Limited review credibility signals and freshness/provenance transparency.
- Search behavior still brittle for real-world messy queries.

### Product Management Infrastructure
- Telemetry exists (`telemetry_events`, unlock events); dashboard / weekly review discipline still light.
- Guest-restriction messaging can be clearer and more value-oriented.
- Multilingual strategy not fully explicit in UX behavior.

---

## Nice to Have (Backlog)

- Reduce cognitive load in long edit forms (progressive sections/steps).
- Improve microcopy consistency across trust states (pending/verified/approved).
- Add "why this result" explanations in search/discovery.
- Improve empty-state guidance for low-data areas.
- Formalize accessibility quality bar and validation loop.
- Add contributor retention loops (impact feedback, profile, reputation).
- Add last-updated/freshness labels on volatile fields (price/vacancy/hours).

---

## Strategy: Fixing the Critical Issues Without Killing Growth

The key challenge is a classic cold-start marketplace problem:
- New parents need information ("Get"), but cannot yet contribute historical reviews ("Give").
- Solution: support multiple contribution currencies, not only reviews.

## 1) Real Approval System (Moderation Engine)

### Phase 1: Automated Guardrails (fastest path)
- **Shipped (edits):** blacklist, directional price/location/staff-ratio checks, hours/phone/age guards, rate limits, and reputation/OAuth trust gating in `validation-engine.ts` + `config/moderation.json`.
- **Still useful:** extend the same ideas to other input types, tune thresholds from data, and tighten “trusted” definitions if abuse appears.

### Phase 2: Shadow Materialization UX
- On submit, show change as **Pending Verification** to submitting user.
- Public data remains unchanged until approved/materialized (**product goal**; today, **auto-approved** edits already patch **`ganim_v2`** immediately—see **C3**).
- Outcome: honest user feedback loop; less confusion about "saved but not visible".

### Phase 3: Lightweight Admin Triage
- **Shipped:** `/admin/triage` plus `POST /api/admin/triage/decision` (see [docs/database.md](docs/database.md)).
- **Remaining:** richer diff/reviewer tooling, SLAs, and throughput workflows.

## 2) Solving Give-to-Get Catch-22 (Soft Gate Model)

Allow parents to contribute via **data**, **effort**, or **referrals**.

| User Type | Give (Action) | Get (Reward) |
| --- | --- | --- |
| Experienced Parent | Write a high-quality review | Full access for a period (e.g. 1 year) |
| First-Time Parent | Invite a veteran parent who contributes | Access unlock after qualifying action |
| First-Time Parent | Verify micro-tasks (phone/hours/status) | Time-boxed **`full_access`** after N tasks (`grantFullAccess` + `ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS`; same type as review unlock—not a separate DB `day_pass`) |
| First-Time Parent | Complete onboarding profile (age, area, budget) | Limited review access (quota-based) |

This preserves growth while protecting contribution economics.

---

## Immediate Implementation Sequence (Recommended)

**Note:** Steps A–B below are largely implemented in code and migrations; this sequence remains as the original plan and backlog anchor (referral loop still open).

### Step A: Introduce Pending Status in `user_inputs`
- **Done:** `status` lifecycle on `user_inputs`; public review reads use **`confirmed_reviews`**; edits use moderation + triage/processor as described in [docs/database.md](docs/database.md).
- **Remaining:** keep pending/rejected UX and copy consistent everywhere submissions surface.

### Step B: Replace hard login gate with capability gate
- **Done (feature-flagged):** entitlements + `FF_SOFT_GATE` per [GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md); unlock modal paths (review / bounty / onboarding) without referral.
- **Remaining:** referral-based unlock; clearer guest messaging; economics/copy passes.

### Step C: Launch basic referral loop
- Add `referral_codes` and referral attribution flow.
- Unlock access when invited parent completes qualifying contribution.
- Notify referrer when unlock is granted.

---

## Suggested Data Model Additions

**Shipped today:** `user_inputs` includes **`status`**, **`moderation_reason`**, **`reviewed_at`**, **`reviewed_by`** (see migration `20260311132000_user_inputs_moderation_fields.sql` and related status migrations). The bullets below are **original target / backlog** naming where it still differs (e.g. no `risk_score` column in migrations yet).

### `user_inputs` (extend — target vs shipped)
- `status`: `pending | approved | rejected` — **shipped**
- `moderation_reason`: nullable text — **shipped** (edit path stores reason codes here; no separate `risk_score` column yet)
- `risk_score`: nullable numeric — **not in DB** (future if you want structured scoring)
- `reviewed_by`: nullable user id — **shipped** (Part A of [SPEC_ENTITLEMENTS_AND_MODERATION.md](SPEC_ENTITLEMENTS_AND_MODERATION.md) used aspirational `approved_by` / `approved_at`; production uses **`reviewed_*`**)
- `reviewed_at`: timestamptz — **shipped**

### `user_access_entitlements` (shipped — `day_pass` type not used)
- `user_id`
- `entitlement_type` (`full_access`, `review_quota` in DB; `day_pass` was design-only)
- `source` (`review`, `referral`, `bounty`, `onboarding`, `admin`)
- `starts_at`, `expires_at`
- `quota_remaining` (nullable)

### `referral_codes` (new)
- `code`
- `owner_user_id`
- `created_at`
- `max_uses` (optional)
- `uses_count`

### `referral_events` (new)
- `code`
- `invited_user_id`
- `qualifying_action`
- `qualified_at`
- `unlock_granted_at`

---

## Success Metrics (First Version)

### Safety and Trust
- % of high-risk edits sent to manual review.
- Moderation SLA (pending -> resolved).
- Rejection rate by submission type and user cohort.

### Marketplace Health
- Review unlock conversion rate by unlock path.
- % new parents unlocked via non-review paths.
- Contribution rate (reviews + verifications + referrals).

### User Experience
- "Saved but not visible" support complaints.
- Time to first trustable value (first useful review read).
- D7 return rate for first-time parents.

---

## Open Product Decisions

- Entitlement duration and quotas (how much access each contribution grants).
- What counts as a "qualifying referral action."
- Thresholds for automatic vs manual moderation.
- Minimum review quality bar for unlock credits.
- Handling edge cases (single parent with no network to refer).

---

## Next Milestone Proposal

### Milestone 1 (2 weeks)
- **Largely done:** pending/approved on `user_inputs`, moderation guardrails for edits, `/admin/triage`.
- **Still open:** pending UX consistency everywhere; reviewer tooling depth.

### Milestone 2 (2-3 weeks)
- **Largely done:** entitlement model, soft gate, bounty + onboarding unlock APIs/UI.
- **Still open:** referral code generation + attribution.

### Milestone 3 (2 weeks)
- Add instrumentation dashboard and cohort analysis.
- Tune unlock economics and moderation thresholds from data.

