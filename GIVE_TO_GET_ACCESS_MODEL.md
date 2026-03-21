# Give-to-Get Access Model

This document defines the access economics for review visibility.

**Doc map:** [docs/README.md](docs/README.md) · **Non-normative target/backlog:** [SPEC_ENTITLEMENTS_AND_MODERATION.md](SPEC_ENTITLEMENTS_AND_MODERATION.md) (read its top warning) · **HTTP + DB flow detail:** [docs/database.md](docs/database.md)

## Master switch: `FF_SOFT_GATE`

Implemented in `src/lib/env/server.ts` and enforced in `GET /api/entitlements/me`, `GET /api/reviews`, unlock routes, and parts of triage/edit flows.

| `FF_SOFT_GATE` | Behavior |
|----------------|----------|
| **`false`** (default in `.env.example`) | Any **logged-in** user is treated as able to view reviews: `/api/entitlements/me` returns `can_view_reviews: true`, and `GET /api/reviews` does **not** check entitlements or consume quota. **`has_full_access` and `review_quota_remaining` stay ledger-accurate** (often false / 0) even though reads are open—UI and clients should treat **`can_view_reviews`** as the read gate when the soft gate is off. Unlock UI flags may still be returned for display, but **bounty** and **onboarding** unlock endpoints return 403 (`Bounty unlock disabled` / `Onboarding unlock disabled`). |
| **`true`** | Entitlements apply: `getAccessSnapshot()` in `src/lib/entitlements/service.ts` reads `user_access_entitlements`. `GET /api/reviews` returns 403 if the user has no access. **Quota:** only users who **do not** have active **`full_access`** but **do** have **`review_quota` remaining** pay one unit per successful fetch (`consumeOneReviewQuota` in `GET /api/reviews`). Users with full access do not consume quota on read. Bounty/onboarding POST unlock routes work only if their sub-flags (`FF_BOUNTY_UNLOCK`, `FF_ONBOARDING_UNLOCK`) are also on. |

Sub-flags (all require **`FF_SOFT_GATE=true`** for the unlock POST routes): `FF_BOUNTY_UNLOCK`, `FF_ONBOARDING_UNLOCK`, `FF_REFERRAL_UNLOCK` (exposed to the client for UI only; **no referral grant API**—turning it on without product support can mislead users).

**Implementation note:** In `src/lib/env/server.ts`, `FF_ONBOARDING_UNLOCK` is **on by default when the variable is unset** (unlike the other boolean flags, which default to off). To disable onboarding unlock in code terms, set `FF_ONBOARDING_UNLOCK=false` explicitly.

Working name:
- Product name: **Give-to-Get**
- Technical name: **Entitlement Soft Gate**

## Access Path Matrix

| Path | Who | Give (Action) | Validation / Trigger | Access Granted | Default Config | Status |
|---|---|---|---|---|---|---|
| Review contribution | Experienced parent | Submit a review | `POST /api/reviews` inserts `user_inputs` (`input_type=review`, `status=pending`). If **`FF_SOFT_GATE`** and user lacks `full_access`, best-effort **`full_access`** for `ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS` (default **1**) so they can read reviews while pending. | Temporary `full_access` on submit (when gate on) | `ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS=1` | Implemented |
| Review approved | Experienced parent | Triage approves review | `POST /api/admin/triage/decision` approves row; upserts **`confirmed_reviews`**; if **`FF_SOFT_GATE`**, `grantFullAccess` with `source=review` | `full_access` | `ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS=365` | Implemented |
| Edit contribution | Contributor | Submit an edit | `POST /api/ganim/edit` inserts **`user_inputs`** (`input_type=edit`, `status` = auto-moderation result). If **`FF_SOFT_GATE`** and the user does not already have **`full_access`** (`!hasFullAccess` in snapshot), best-effort **`full_access`** for **`ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS`** with **`source=bounty`** (telemetry path `bounty`). **No insert** if the patch is a no-op (`skipInsert` / “no meaningful change”)—then no ledger row and no entitlement side effects. | Temporary `full_access` on submit when gate on (same env as review submit) | `ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS=1` | Implemented |
| Edit auto-approved | Contributor | Auto-moderation returns `approved` on submit | Same **`POST /api/ganim/edit`** request: updates **`ganim_v2`** immediately; if **`FF_SOFT_GATE`**, **`grantFullAccess`** with **`source=bounty`**, duration **`ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS`**, idempotent **`source_ref`** `{user_input_id}:approved`. | `full_access` | `ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS=365` | Implemented |
| Edit approved (triage) | Contributor | Triage approves a **pending** edit | `POST /api/admin/triage/decision` for `input_type=edit`; **`ganim_v2`** is **not** updated here—**`process_user_inputs`** applies the patch; if **`FF_SOFT_GATE`**, `grantFullAccess` with **`source=bounty`** | `full_access` | `ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS=365` | Implemented |
| Bounty | First-time parent | Complete verification micro-tasks | `POST /api/entitlements/unlock/bounty` with `task_keys` ⊆ `{phone_verified,hours_verified,vacancy_verified}` and count ≥ required | `full_access` | `ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS=365`, `ENTITLEMENT_BOUNTY_REQUIRED_TASKS=3` | Implemented (needs **`FF_SOFT_GATE` + `FF_BOUNTY_UNLOCK`**) |
| Onboarding | First-time parent | Submit onboarding profile | `POST /api/entitlements/unlock/onboarding` with valid profile payload | `review_quota` | `ENTITLEMENT_ONBOARDING_REVIEW_QUOTA=3` | Implemented (needs **`FF_SOFT_GATE` + `FF_ONBOARDING_UNLOCK`**) |
| Referral | Community helper | Invite user who completes qualifying action | Referral qualification pipeline | entitlement for inviter (typically `full_access`) | future config | Placeholder |
| Admin auto grant | Admin user | Email in `ADMIN_EMAILS` | `ensureAdminFullAccessForUser` on `GET /api/entitlements/me`, triage, reviews, etc.; `GET /api/admin/me` may run throttled `backfillAdminFullAccessFromConfig` (~5 min) | `full_access` (no expiry) | `ADMIN_EMAILS` | Implemented |
| Admin override | Admin / ops | Manual DB insert/update in entitlements table | Manual action in Supabase | `full_access` or `review_quota` | manual values | Available |

**Edits vs map data:** `POST /api/ganim/edit` patches **`ganim_v2` immediately** only when auto-moderation returns **`approved`** on submit. If the edit was **`pending`** and is later **`approved`** in triage, **`ganim_v2`** is updated by the background **`process_user_inputs`** pipeline (triage does not merge edit fields). **Entitlements** for edits (temp submit, auto-approve grant, triage approve grant) are separate from that map rule—see the matrix rows above. See [docs/database.md](docs/database.md).

## Entitlement Types

| Entitlement Type | Meaning | Gate Result |
|---|---|---|
| `full_access` | Time-boxed full review access until `expires_at` | User can view reviews |
| `review_quota` | Limited number of review fetches via `quota_remaining` | User can view reviews until quota is exhausted |

## Source of Truth

Primary table:
- `public.user_access_entitlements`

Related tables:
- `public.user_onboarding_profiles`
- `public.user_bounty_completions`
- `public.telemetry_events`

Other tables used by the gate UX (not entitlement ledger):
- `public.user_rejection_notice_windows` — short-lived UI when a moderator rejects a user’s submission (`GanDetail`).
- `public.review_contact_messages` — outbound “contact reviewer” relay when that feature is enabled (`CONTACT_REVIEWER_ENABLED`).

## Read This Like a Human

- `user_access_entitlements` is an **access ledger**:
  - each row means "we granted this access at this time for this reason"
  - users can have multiple rows over time
- `telemetry_events` is a **behavior timeline**:
  - what the user clicked/saw/did in the funnel
  - useful for product analytics and debugging flow drop-offs
- Current access is **computed**, not stored as a single row.

### Effective Access Rule (Important)

When deciding what a user can do **right now**:
1. If user has any active `full_access` row -> user has full access.
2. Else if user has active `review_quota` with total `quota_remaining > 0` -> user has limited access.
3. Else -> `no_access` (implicit default, no explicit row required).

This means:
- if a user first got `full_access`, and later got `review_quota`, their effective status is still `full_access` while that full access is active.
- precedence is based on capability, not on which row was inserted last.

## SQL Cookbook

### 1) Effective access snapshot for all users (recommended)

```sql
with active as (
  select
    e.user_id,
    e.entitlement_type,
    coalesce(e.quota_remaining, 0) as quota_remaining
  from public.user_access_entitlements e
  where e.starts_at <= now()
    and (e.expires_at is null or e.expires_at > now())
),
agg as (
  select
    u.id as user_id,
    u.email,
    bool_or(a.entitlement_type = 'full_access') as has_full_access,
    coalesce(sum(case when a.entitlement_type = 'review_quota' then greatest(a.quota_remaining, 0) else 0 end), 0) as quota_remaining_total
  from auth.users u
  left join active a on a.user_id = u.id
  group by u.id, u.email
)
select
  user_id,
  email,
  case
    when has_full_access then 'full_access'
    when quota_remaining_total > 0 then 'review_quota'
    else 'no_access'
  end as effective_status,
  has_full_access,
  quota_remaining_total
from agg
order by email;
```

### 2) Effective access for a single user

```sql
-- replace with real uuid
with target as (
  select 'PUT_USER_UUID_HERE'::uuid as user_id
),
active as (
  select
    e.user_id,
    e.entitlement_type,
    coalesce(e.quota_remaining, 0) as quota_remaining
  from public.user_access_entitlements e
  join target t on t.user_id = e.user_id
  where e.starts_at <= now()
    and (e.expires_at is null or e.expires_at > now())
)
select
  t.user_id,
  case
    when bool_or(a.entitlement_type = 'full_access') then 'full_access'
    when coalesce(sum(case when a.entitlement_type = 'review_quota' then greatest(a.quota_remaining, 0) else 0 end), 0) > 0 then 'review_quota'
    else 'no_access'
  end as effective_status,
  bool_or(a.entitlement_type = 'full_access') as has_full_access,
  coalesce(sum(case when a.entitlement_type = 'review_quota' then greatest(a.quota_remaining, 0) else 0 end), 0) as quota_remaining_total
from target t
left join active a on a.user_id = t.user_id
group by t.user_id;
```

### 3) See full entitlement ledger for a user (history)

```sql
-- replace with real uuid
select
  id,
  user_id,
  entitlement_type,
  source,
  source_ref,
  starts_at,
  expires_at,
  quota_remaining,
  metadata,
  created_at,
  updated_at
from public.user_access_entitlements
where user_id = 'PUT_USER_UUID_HERE'::uuid
order by created_at desc;
```

### 4) See telemetry timeline for a user

```sql
-- replace with real uuid
select
  created_at,
  event_name,
  path,
  source_surface,
  entity_id,
  metadata
from public.telemetry_events
where user_id = 'PUT_USER_UUID_HERE'::uuid
order by created_at desc;
```

## Table Reference (Example Rows + Field Meanings)

### `public.user_access_entitlements`

Example row:

```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "entitlement_type": "full_access",
  "source": "review",
  "source_ref": "input_9f7c",
  "starts_at": "2026-03-13T10:00:00Z",
  "expires_at": "2027-03-13T10:00:00Z",
  "quota_remaining": null,
  "metadata": { "user_input_id": "input_9f7c", "gan_id": "gan_123" },
  "created_at": "2026-03-13T10:00:00Z",
  "updated_at": "2026-03-13T10:00:00Z"
}
```

Field meanings:
- `id`: unique entitlement record id.
- `user_id`: user that receives this access.
- `entitlement_type`: access type (`full_access` or `review_quota`).
- `source`: why/how it was granted (`review`, `bounty`, `onboarding`, etc.).
- `source_ref`: idempotency link to the granting action (optional).
- `starts_at`: when entitlement becomes active.
- `expires_at`: when access ends (`null` means no time expiry).
- `quota_remaining`: remaining allowed review fetches (only for quota type).
- `metadata`: extra context for audit/debug (json).
- `created_at`: insert timestamp.
- `updated_at`: last update timestamp.

### `public.user_onboarding_profiles`

Example row:

```json
{
  "id": "22222222-2222-2222-2222-222222222222",
  "user_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  "city": "Tel Aviv",
  "number_of_kids": 2,
  "kids_ages": [2, 4],
  "neighborhood": "Lev HaIr",
  "budget_range": "3500-5000",
  "created_at": "2026-03-13T11:00:00Z",
  "updated_at": "2026-03-13T11:00:00Z"
}
```

Field meanings:
- `id`: onboarding profile id.
- `user_id`: owner of the profile (one row per user).
- `city`: required city value.
- `number_of_kids`: required number of children.
- `kids_ages`: required list of child ages.
- `neighborhood`: optional finer location.
- `budget_range`: optional budget band.
- `created_at`: first creation time.
- `updated_at`: last profile update time.

### `public.user_bounty_completions`

Example row:

```json
{
  "id": "33333333-3333-3333-3333-333333333333",
  "user_id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
  "task_keys": ["phone_verified", "hours_verified", "vacancy_verified"],
  "task_count": 3,
  "metadata": { "required_task_count": 3 },
  "created_at": "2026-03-13T12:00:00Z"
}
```

Field meanings:
- `id`: bounty completion id.
- `user_id`: user who completed tasks.
- `task_keys`: normalized task identifiers completed by user.
- `task_count`: count of accepted task keys in this submission.
- `metadata`: additional context (validation policy, notes).
- `created_at`: submission timestamp.

### `public.telemetry_events`

Example row:

```json
{
  "id": "44444444-4444-4444-4444-444444444444",
  "event_name": "unlock_path_selected",
  "user_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
  "path": "onboarding",
  "source_surface": "gan_detail_reviews",
  "entity_id": "gan_123",
  "metadata": { "number_of_kids": 2, "city": "Tel Aviv" },
  "created_at": "2026-03-13T12:15:00Z"
}
```

Field meanings:
- `id`: event id.
- `event_name`: event type (`lock_wall_viewed`, `entitlement_granted`, etc.).
- `user_id`: user associated with this event.
- `path`: unlock path context (`review`, `bounty`, `onboarding`, `referral`).
- `source_surface`: UI/API origin that emitted the event.
- `entity_id`: related business entity (often `gan_id` or action id).
- `metadata`: extra event properties for analysis.
- `created_at`: event timestamp.

