# GanMatch Product Audit and Action Plan

This document captures the current product audit and proposed fixes so we can iterate over time.

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

### C1) Give-to-Get is technically broken
- **Current state**: Review visibility is unlocked by login (`canViewReviews = !!user`) rather than meaningful contribution.
- **Risk**: Core value loop is not aligned with product promise; weak contribution incentive.
- **Owner**: Product + Eng
- **Status**: Open

### C2) Moderation is effectively auto-approve
- **Current state**: Edit moderation currently approves all patches.
- **Risk**: Childcare data can be manipulated or degraded; trust and safety liability.
- **Owner**: Product + Eng
- **Status**: Open

### C3) Materialization dependency is opaque to users
- **Current state**: User edits/reviews flow through `user_inputs` and depend on processor materialization.
- **Risk**: User sees "saved" but public data may not reflect it immediately.
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
- No admin moderation triage surface.
- Limited review credibility signals and freshness/provenance transparency.
- Search behavior still brittle for real-world messy queries.

### Product Management Infrastructure
- No clear product analytics instrumentation for funnel diagnosis.
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
- Add sanity checks in approval logic:
  - Regex blacklist for abusive/prohibited terms.
  - Diff thresholds (e.g., large price/location jumps -> pending review).
  - Reputation gating (trusted contributors can auto-approve low-risk edits).
- Outcome: immediate risk reduction with low implementation complexity.

### Phase 2: Shadow Materialization UX
- On submit, show change as **Pending Verification** to submitting user.
- Public data remains unchanged until approved/materialized.
- Outcome: honest user feedback loop; less confusion about "saved but not visible".

### Phase 3: Lightweight Admin Triage
- Create simple `/admin/triage`:
  - Query pending submissions.
  - Show Original vs New values, user id, timestamp.
  - Approve / Reject actions.
- Outcome: human override and operational moderation without heavy tooling.

## 2) Solving Give-to-Get Catch-22 (Soft Gate Model)

Allow parents to contribute via **data**, **effort**, or **referrals**.

| User Type | Give (Action) | Get (Reward) |
| --- | --- | --- |
| Experienced Parent | Write a high-quality review | Full access for a period (e.g. 1 year) |
| First-Time Parent | Invite a veteran parent who contributes | Access unlock after qualifying action |
| First-Time Parent | Verify micro-tasks (phone/hours/status) | Time-based day pass |
| First-Time Parent | Complete onboarding profile (age, area, budget) | Limited review access (quota-based) |

This preserves growth while protecting contribution economics.

---

## Immediate Implementation Sequence (Recommended)

### Step A: Introduce Pending Status in `user_inputs`
- Add `status` column (`pending` default; `approved`/`rejected` lifecycle).
- Ensure public read paths only use approved/materialized records.
- Make pending state explicit in UI.

### Step B: Replace hard login gate with capability gate
- Replace `canViewReviews = !!user` with capability model, e.g.:
  - `has_contributed`
  - `has_referral_unlock`
  - `is_admin`
  - `has_day_pass`
- If locked, show contribution modal with multiple unlock options:
  1. I have experience -> write review.
  2. First-time parent -> complete verification bounty.
  3. Invite trusted parent -> referral path.

### Step C: Launch basic referral loop
- Add `referral_codes` and referral attribution flow.
- Unlock access when invited parent completes qualifying contribution.
- Notify referrer when unlock is granted.

---

## Suggested Data Model Additions

### `user_inputs` (extend)
- `status`: `pending | approved | rejected`
- `moderation_reason`: nullable text
- `risk_score`: nullable numeric
- `approved_by`: nullable user id
- `approved_at`: nullable timestamp

### `user_access_entitlements` (new)
- `user_id`
- `entitlement_type` (`full_access`, `day_pass`, `review_quota`)
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
- Add pending/approved states + moderation guardrails.
- Add pending UX badge and user feedback.
- Ship basic admin triage page.

### Milestone 2 (2-3 weeks)
- Introduce entitlement model and soft gate modal.
- Add verification bounty flow.
- Add referral code generation + attribution.

### Milestone 3 (2 weeks)
- Add instrumentation dashboard and cohort analysis.
- Tune unlock economics and moderation thresholds from data.

