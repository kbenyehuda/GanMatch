# Spec: Entitlements and Moderation

Engineering specification for moderation workflow and Give-to-Get soft-gating.

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

## A1. Data Model Changes

### Table: `user_inputs` (extend)
- `status` text not null default `'pending'`
  - allowed values: `pending`, `approved`, `rejected`
- `risk_score` numeric null
- `moderation_reason` text null
- `approved_by` uuid null
- `approved_at` timestamptz null
- `rejected_by` uuid null
- `rejected_at` timestamptz null

### Optional Table: `moderation_events`
- `id` uuid pk
- `user_input_id` uuid not null
- `event_type` text not null (`submitted`, `auto_flagged`, `approved`, `rejected`)
- `actor_user_id` uuid null
- `metadata` jsonb null
- `created_at` timestamptz not null default now()

## A2. Approval Policy (v1)

Function contract:
- input: `{ userId, ganId, patch }`
- output:
  - `{ decision: "approve", riskScore, reasonCodes[] }`
  - `{ decision: "pending", riskScore, reasonCodes[] }`
  - `{ decision: "reject", riskScore, reasonCodes[] }`

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
- Write to `user_inputs` with returned `status`, `risk_score`, `moderation_reason`.
- Return response:
  - `status: approved|pending|rejected`
  - user-facing message

### Materialization Processor
- Only materialize rows with `status = 'approved'`.
- Skip pending/rejected rows.
- Idempotent by input id.

## A4. UX Behavior

- Submitter sees immediate local confirmation + badge:
  - approved: "Published"
  - pending: "Pending verification"
  - rejected: "Needs correction"
- Public views should never show pending/rejected changes.

## A5. Admin Triage

Route: `/admin/triage`
- List: pending items sorted by risk and age.
- Row details:
  - field diffs (old -> new)
  - user id and trust signals
  - risk score and reason codes
- Actions:
  - approve (sets status + metadata)
  - reject (sets status + reason)

---

## Part B: Entitlements and Soft Gate

## B1. Data Model

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

### Table: `referral_codes`
- `code` text pk
- `owner_user_id` uuid not null
- `max_uses` int null
- `uses_count` int not null default 0
- `created_at` timestamptz not null default now()

### Table: `referral_events`
- `id` uuid pk
- `code` text not null
- `invited_user_id` uuid not null
- `qualifying_action` text null
- `qualified_at` timestamptz null
- `unlock_granted_at` timestamptz null
- `created_at` timestamptz not null default now()

## B2. Capability Rule

Replace login-based check with capability-based check.

Pseudo-logic:

```ts
function canViewReviews(user: User | null): boolean {
  if (!user) return false;
  if (user.isAdmin) return true;
  if (hasActiveEntitlement(user.id, "full_access")) return true;
  if (hasActiveEntitlement(user.id, "day_pass")) return true;
  if (hasQuota(user.id, "review_quota")) return true;
  return false;
}
```

## B3. Unlock Paths (v1)

1) **Experienced Parent**
- Action: submits accepted quality review.
- Reward: full access entitlement (time-boxed).

2) **First-Time Parent: Bounty**
- Action: completes N verified micro-tasks.
- Reward: day pass entitlement.

3) **Referral Path**
- Action: invitee signs up and completes qualifying action.
- Reward: entitlement for inviter.

4) **Onboarding Path (optional in v1)**
- Action: complete profile context.
- Reward: limited review quota.

## B4. Locked State UX

When user is blocked from full review visibility:
- Show modal with three action cards:
  - "I was a parent here" -> review flow
  - "I am searching for first gan" -> bounty flow
  - "Invite and unlock" -> referral flow
- Always show expected reward clearly (what unlocks and for how long).

## B5. Abuse Prevention

- Rate limit unlock attempts per day.
- Require qualifying thresholds for referral unlocks.
- Deny duplicate self-referrals and suspicious patterns.
- Keep audit trail for entitlement grants.

---

## Part C: Events and Telemetry

Minimum events:
- `lock_wall_viewed`
- `unlock_path_selected`
- `contribution_submitted`
- `contribution_approved`/++5
+?>
.0`
3entitlemen.30t0_granted`
- `review_viewed`
- `moderation_pending_created`
- `moderation_decision_made`

Required properties:
- `user_id`
- `path` (`review|bounty|referral|onboarding`)
- `source_surface` (where lock wall was shown)
- `entity_id` (`gan_id`, `user_input_id`, `referral_code`)
- `timestamp`

---

## Part D: Rollout Plan

## Phase 0 (feature flags)
- `FF_MODERATION_STATUS`
- `FF_SOFT_GATE`
- `FF_BOUNTY_UNLOCK`
- `FF_REFERRAL_UNLOCK`

## Phase 1
- Enable moderation statuses and pending UX.
- Keep old review gate in parallel as fallback.

## Phase 2
- Enable capability gate for subset of users (e.g., 10%).
- Compare funnel and moderation metrics.

## Phase 3
- Ramp to 100% after KPI and quality checks pass.

---

## Part E: Acceptance Criteria

Moderation:
- All new submissions persisted with explicit status.
- Materializer ignores non-approved rows.
- Admin can approve/reject from triage.

Entitlements:
- Review visibility uses capability gate (not just auth).
- At least one non-review unlock path is live.
- Entitlements created and consumed correctly with expiry/quota rules.

Observability:
- Core events emitted reliably.
- Weekly dashboard supports funnel + moderation decisions.

