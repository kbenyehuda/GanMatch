# GanMatch — Agent Guide

Israeli kindergarten/daycare discovery platform. Parents find and compare ganim (גנים) on an interactive map using government data + community reviews. Hebrew-only UI, RTL layout throughout.

**Human README:** [README.md](README.md) · **Docs index:** [docs/README.md](docs/README.md)

---

## Ask before acting

**Do not run any action — Supabase MCP tools (migrations, SQL writes, pause/restore project, branches, etc.), destructive git commands, deployments, or any other state-changing operation — without asking the user first and getting explicit confirmation, every time.** This holds even mid-task, even for steps that seem obviously implied by what was just discussed. Read-only lookups (reading files, listing tables, `git status`) are fine without asking.

---

## Active Categories (as of 2026-05-23)

Only **3 categories** are shown in the UI right now: `kids`, `doctor`, `cosmetics`.

The other 4 — `cafe`, `sport`, `attraction`, `food` — are **fully supported** in the DB, API, types, filters, and map pins. They are hidden only in the UI (`VISIBLE_CATEGORIES` in `src/types/places.ts`). Do **not** delete or remove code for these categories. When data is ready for a category, add it back to `VISIBLE_CATEGORIES`.

To re-enable a category: add it to the `VISIBLE_CATEGORIES` array in `src/types/places.ts`. That's the single change needed.

---

## Tech Stack

- **Next.js App Router** (TypeScript) — `src/app/` for routes and API handlers
- **Tailwind CSS** + Shadcn-style primitives in `src/components/ui/`
- **Supabase** — PostgreSQL + PostGIS for spatial queries; auth via Supabase Auth
- **Mapbox GL JS** (`react-map-gl`) — map rendering and clustering
- **Lucide React** — icons

Run: `npm run dev`. Schema: apply `supabase/migrations/` in timestamp order.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # → HomeMap (the entire app)
│   ├── gan/[id]/page.tsx         # Shareable gan URL (seeds HomeMap with a specific gan)
│   ├── admin/triage/             # Moderator UI
│   ├── api/
│   │   ├── ganim/                # GET (viewport), search, edit
│   │   ├── reviews/              # GET + POST
│   │   ├── entitlements/         # me, progress, unlock/bounty, unlock/onboarding
│   │   ├── admin/                # me, triage/decision
│   │   ├── geocode/              # suggest, reverse
│   │   ├── contact-reviewer/     # email relay (gated by CONTACT_REVIEWER_ENABLED)
│   │   └── telemetry/track/
├── components/
│   ├── home/HomeMap.tsx          # Top-level orchestrator — owns most app state
│   ├── gan/
│   │   ├── GanDetail.tsx         # Large: display + edit form + review list + unlock flow
│   │   ├── GanReviewModal.tsx    # Review submission form
│   │   ├── SuggestGanModal.tsx   # Suggest a new gan (with map pin drop)
│   │   ├── GanClusterList.tsx    # Cluster explode list
│   │   ├── GanAttributeIcons.tsx # Icon row for a gan card
│   │   ├── DargaCalculator.tsx   # Subsidy calculator
│   │   └── ContactReviewerModal.tsx
│   ├── layout/
│   │   ├── SearchResultsPanel.tsx  # Left panel (desktop) / bottom sheet (mobile) + FilterPanel
│   │   └── FilterPanel.tsx         # All filter UI (20 dimensions)
│   ├── map/MapContainer.tsx      # Mapbox GL — pins, clusters, interactions
│   ├── auth/                     # AuthButton, ConnectionGate (login gate)
│   └── ui/                       # button, card, StarRating, StarRatingInput
├── hooks/useViewportGanim.ts     # Fetches ganim for current map bounds
├── lib/
│   ├── entitlements/service.ts   # server-only: getAccessSnapshot, grantFullAccess, etc.
│   ├── moderation/               # gan-edit-approval.ts, validation-engine.ts, moderation-config.ts
│   ├── env/public.ts             # NEXT_PUBLIC_* env (client-safe)
│   ├── env/server.ts             # server-only env + feature flags
│   ├── gan-display.ts            # Hebrew label formatters (category, meal, kosher, …)
│   ├── gan-format.ts             # Address/city/neighborhood extraction from Gan
│   ├── ganim-api.ts              # Client-side fetch helpers
│   ├── apply-filters.ts          # Client-side filter logic
│   ├── darga-calculator.ts       # Subsidy bracket math
│   └── supabase.ts               # Anon client (null-safe when env vars missing)
└── types/
    ├── ganim.ts                  # Gan, Review, GanCategory, enums
    ├── filters.ts                # GanFilters, DEFAULT_FILTERS, countActiveFilters
    └── search.ts                 # SearchSuggestion
```

---

## The Give-to-Get Access Model

This is the most non-obvious part of the codebase. Read this section before touching anything related to reviews, entitlements, or the unlock UI.

**Full reference:** [GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md)

### Master switch: `FF_SOFT_GATE`

Defined in `src/lib/env/server.ts`, enforced in `GET /api/entitlements/me`, `GET /api/reviews`, unlock routes.

| `FF_SOFT_GATE` | Behavior |
|---|---|
| **`false`** (default) | Any logged-in user can read reviews. The entitlement ledger still exists and stays accurate, but `can_view_reviews` is always true for authenticated users. Unlock POST endpoints return 403. |
| **`true`** | Entitlements enforced. `getAccessSnapshot()` reads `user_access_entitlements`. Reviews return 403 without access. Bounty/onboarding unlock routes work when their sub-flags are also on. |

**Always gate on `can_view_reviews`, never on `has_full_access`.** The two can diverge (especially when `FF_SOFT_GATE=false`).

### Sub-flags (require `FF_SOFT_GATE=true` for POST routes)

| Flag | Default | Note |
|---|---|---|
| `FF_BOUNTY_UNLOCK` | off | Bounty task verification path |
| `FF_ONBOARDING_UNLOCK` | **on** (default when unset) | Onboarding profile path — **on by default, unlike the others** |
| `FF_REFERRAL_UNLOCK` | off | UI flag only; no grant API exists yet |

### How users earn access

| Action | Entitlement granted |
|---|---|
| Submit a review | Temporary `full_access` for `ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS` (default 1 day) |
| Review approved by triage | `full_access` for `ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS` (default 365 days) |
| Submit an edit (auto-approved) | `full_access` for 365 days |
| Submit an edit (pending, later approved) | `full_access` via triage decision |
| Bounty tasks (≥3 verifications) | `full_access` for `ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS` (365) |
| Onboarding profile | `review_quota` of `ENTITLEMENT_ONBOARDING_REVIEW_QUOTA` (3 reads) |
| Admin email in `ADMIN_EMAILS` | Permanent `full_access`, no expiry |

### Effective access rule

1. Active `full_access` row → full access.
2. Else active `review_quota` with `quota_remaining > 0` → limited access.
3. Else → no access.

Access is **computed from the ledger**, not stored as a single flag.

---

## Data Flow: Edits and Reviews

Understanding which things update the map immediately vs. requiring the background worker is critical.

```
User submits edit (POST /api/ganim/edit)
  ├── validation-engine.ts → "approved"
  │     → ganim_v2 updated immediately (map shows change at once)
  │     → user_inputs row inserted (status=approved)
  │     → full_access entitlement granted (if FF_SOFT_GATE)
  └── validation-engine.ts → "pending"
        → user_inputs row inserted (status=pending)
        → map NOT updated
        → admin approves via /admin/triage
              → user_inputs.status = "approved"
              → entitlement granted (if FF_SOFT_GATE)
              → ganim_v2 NOT updated here — worker applies it

User submits review (POST /api/reviews)
  → user_inputs row inserted (status=pending)
  → admin approves via /admin/triage
        → confirmed_reviews row inserted (visible immediately)
        → entitlement granted (if FF_SOFT_GATE)

Background worker (scripts/user_inputs/process_user_inputs.py)
  → applies approved edits to ganim_v2
  → handles suggest_gan materialization
  → npm run process-user-inputs (or :watch / :realtime)
```

**Key gotcha:** triage-approved edits only hit `ganim_v2` when the worker runs. If the map doesn't update after triage approval, the worker probably hasn't run.

---

## Moderation Pipeline

Edit submissions run through `src/lib/moderation/validation-engine.ts`, configured by `config/moderation.json` (with `MODERATION_*` env vars as fallbacks).

- Returns only `approved` or `pending` — never `rejected`. Rejection happens manually via `/admin/triage`.
- Auto-approves when: user is trusted (enough approved edits or trusted OAuth provider), no hard flags fire.
- Pending triggers: blacklisted terms, large price/location delta, invalid phone/hours format, rate limit exceeded, low reputation.
- Tune guardrails in `config/moderation.json` — blacklist, thresholds, reputation config.

---

## Key Architectural Decisions

**`HomeMap.tsx` is the orchestrator.** It owns auth state, admin check, entitlements fetch, filter state, map bounds, suggest flow, cluster/gan selection, and mobile panel state. This is intentional (single source of truth) but it's large.

**`GanDetail.tsx` contains the edit form, review list, and unlock flow** all in one component. The edit form has ~25 parallel `useState` fields (one per editable attribute). The unlock flow has ~18 more. Known issue — it works but is hard to maintain.

**`useViewportGanim`** fetches ganim whenever the map bounds change (with debounce). It merges the new viewport data with any locally-added ganim (from suggest flow, seed from URL) to avoid pins disappearing while the user browses.

**RTL is applied at the root** (`dir="rtl"` on the container div in `HomeMap.tsx`). Use Tailwind logical properties (`start`/`end`) not `left`/`right` for positioning overlays.

**Supabase client is null-safe.** `src/lib/supabase.ts` exports `null` when env vars are missing (dev without `.env.local`). Always guard `if (!supabase)` on the client side.

---

## Feature Flags

All defined in `src/lib/env/server.ts` (server) and `src/lib/env/public.ts` (client):

| Flag | Default | What it controls |
|---|---|---|
| `FF_SOFT_GATE` | off | Give-to-Get review gate |
| `FF_BOUNTY_UNLOCK` | off | Bounty task unlock path |
| `FF_ONBOARDING_UNLOCK` | **on** | Onboarding unlock path |
| `FF_REFERRAL_UNLOCK` | off | Shows referral option in UI (no backend) |
| `CONTACT_REVIEWER_ENABLED` | off | Email relay feature (needs Resend config) |
| `NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED` | on | Shows contact UI button (client toggle) |

---

## Hebrew / Localization

- All user-facing strings are in Hebrew. Keep it that way.
- Formatting helpers: `src/lib/gan-display.ts` (category, meal type, kosher, vacancy, etc. → Hebrew labels), `src/lib/gan-format.ts` (address parts).
- RTL layout: use `dir="rtl"` on containers, `start`/`end` Tailwind variants, `font-hebrew` class.
- Date formatting: use `he-IL` locale (e.g. `toLocaleDateString("he-IL", ...)`).

---

## Database Tables (quick reference)

| Table | Purpose |
|---|---|
| `ganim_v2` | The map data. All map RPCs read from here. |
| `user_inputs` | All user submissions (edits, reviews, suggestions) with `status` (pending/approved/rejected). |
| `confirmed_reviews` | Public reviews (materialized from approved `user_inputs`). |
| `user_access_entitlements` | Give-to-Get access ledger. |
| `user_onboarding_profiles` | Onboarding form submissions. |
| `user_bounty_completions` | Bounty task completion records. |
| `telemetry_events` | User behavior timeline (funnel analytics). |
| `user_rejection_notice_windows` | Short-lived UI notice after a moderation rejection. |
| `review_contact_messages` | Audit log for contact-reviewer emails. |

Full schema, migrations, and SQL cookbook: [docs/database.md](docs/database.md).

---

## Current Work in Progress (v3)

Items from [docs/V3_PLAN.md](docs/V3_PLAN.md) that are **not yet started**:

- **Landing / about page** — no `/about` or `/how-it-works` route exists; `src/app/page.tsx` goes straight to the map.
- **`review_scope`** (item 11) — distinguish between reviews of a tzaharon vs. its underlying gan; no DB column, API, or UI wired yet.
- **Contact reviewer modal touch UX** (item 12).
- **Search panel collapse / tablet layout** (item 13).
- **Gan attribute icons — tap-to-explain + legend** (item 14).

Open risks: [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md).

---

## What Not To Do

- **Don't use `left`/`right` for overlay positioning** — use `start`/`end` (RTL logical properties).
- **Don't add English copy** to user-facing UI — everything should be Hebrew.
- **Don't assume `supabase` is non-null** on the client — it's `null` when env vars are missing.
- **Don't touch `ganim_v2` directly from triage for edits** — triage sets `user_inputs.status=approved`; the worker merges to `ganim_v2`. Only the edit API fast-path and suggest-a-gan approval are exceptions.
- **Don't add new UI entitlement logic without checking `FF_SOFT_GATE`** — when the gate is off, `can_view_reviews` is the only field that matters; `has_full_access` can be false even when reads are open.
- **Don't inline the WhatsApp SVG again** — it's already copy-pasted in `GanDetail.tsx` and `SearchResultsPanel.tsx`; the next touch should extract it to `src/components/ui/WhatsAppIcon.tsx`.
