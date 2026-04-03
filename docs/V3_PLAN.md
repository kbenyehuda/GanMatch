# GanMatch v3 — Plan

**Related:** [GAN_TYPES.md](GAN_TYPES.md) · [docs/README.md](README.md) · [PRODUCT_AUDIT.md](../PRODUCT_AUDIT.md)

---

## What is v2

v2 (current deployed version) is a functional map-centric discovery platform for Israeli licensed daycares (ages 0–3). It has:
- Government-sourced licensed daycare data (`ganim_v2`) via data.gov.il
- Viewport-based map with clustering and search
- Give-to-Get review model with entitlements and soft gate
- Gan detail view, Darga calculator, admin triage, moderation engine
- PWA shell

The infrastructure is solid. What's missing is product polish, type correctness in the data, and key discovery/growth features.

---

## v3 North Star

> "Trusted by parents, rated by parents."

The map is the tool. The emotional hook is community trust — reviews, ratings, and recommendations from real parents who have been through the same decision. Every v3 feature should reinforce this.

---

## Features

---

### 1. Landing + Explanatory Page

**Status:** TBD — design-first

**What:**
- A landing screen that is impressive and immediately communicates the value proposition
- An explanatory page (`/about` or `/how-it-works`) that explains:
  - What GanMatch is and who built it
  - The data source (data.gov.il + community contributions)
  - How the type/icon/color system works (pulls from `GAN_TYPES.md` table)
  - How Give-to-Get works
- Both the landing screen and the main map have a persistent link to the explanatory page

**Emotional hook copy (draft):**
> מצאו את הגן שהילד שלכם מגיע לו — על בסיס המלצות הורים אמיתיים

**Notes:**
- The explanatory page must include the icon + color legend from `GAN_TYPES.md` so parents understand what they're looking at on the map
- Design TBD — likely a simple static Next.js page

---

### 2. Gan Type System — Icons, Colors, Data

This is the largest feature in v3. It touches the DB, import pipeline, TypeScript types, map rendering, and the suggest flow. Full type reference: [GAN_TYPES.md](GAN_TYPES.md).

#### 2a. DB Migration

**Problem:** All rows imported from data.gov.il are currently stored as `MAON_SYMBOL` regardless of their real type. The actual type lives in `metadata->'gov'->>'maon_type_code'`.

**Migration (one SQL file):**

```sql
-- Step 1: Add new enum values
ALTER TYPE public.gan_category ADD VALUE 'TZAHARON_MUNICIPAL';
ALTER TYPE public.gan_category ADD VALUE 'TZAHARON_PRIVATE_SUPERVISED';
ALTER TYPE public.gan_category ADD VALUE 'TZAHARON_PRIVATE_UNSUPERVISED';

-- Step 2: Reclassify משפחתון סמל (maon_type_code = 1)
UPDATE public.ganim_v2
SET category = 'MISHPACHTON',
    mishpachton_affiliation = 'TAMAT'
WHERE category = 'MAON_SYMBOL'
  AND metadata->'gov'->>'maon_type_code' = '1';

-- Step 3: Reclassify צהרון (maon_type_code = 2)
UPDATE public.ganim_v2
SET category = 'TZAHARON_MUNICIPAL'
WHERE category = 'MAON_SYMBOL'
  AND metadata->'gov'->>'maon_type_code' = '2';
```

**What is NOT touched:** `PRIVATE_GAN`, `UNSPECIFIED`, `MISHPACHTON`, `MUNICIPAL_GAN` rows from the scraper — left as-is.

#### 2b. Fix Gov Import Script

`scripts/gov_import/import_maon_symbol_datagovil.py` currently hardcodes `MAON_SYMBOL` for all imported rows. It must be updated to set `category` based on `maon_type_code`:
- `0` → `MAON_SYMBOL`
- `1` → `MISHPACHTON` + `mishpachton_affiliation = TAMAT`
- `2` → `TZAHARON_MUNICIPAL`

#### 2c. TypeScript Types

File: `src/types/ganim.ts`
- Add `TZAHARON_MUNICIPAL`, `TZAHARON_PRIVATE_SUPERVISED`, `TZAHARON_PRIVATE_UNSUPERVISED` to `GanCategory`

File: `src/lib/gan-display.ts`
- Add Hebrew labels in `formatGanCategoryHe()` for the 3 new values

#### 2d. Map Icons + Colors

File: `src/components/map/MapContainer.tsx`
- Implement icon + color per `category` (and sub-field where relevant) according to `GAN_TYPES.md`
- Icon shape = type of setting; color = supervision/subsidy level
- Final SVG assets TBD with design; emoji concepts are in `GAN_TYPES.md`

| category | icon | color |
|---|---|---|
| `MAON_SYMBOL` | 🏛️ | #3B82F6 blue |
| `MISHPACHTON` (TAMAT) | 🏠 | #3B82F6 blue |
| `MISHPACHTON` (PRIVATE) | 🏠 | #F97316 orange |
| `PRIVATE_GAN` (SUPERVISED) | 🧩 | #22C55E green |
| `PRIVATE_GAN` (NOT_SUPERVISED) | 🧩 | #F97316 orange |
| `MUNICIPAL_GAN` | 🏙️ | #3B82F6 blue |
| `TZAHARON_MUNICIPAL` (גן + צהרון) | 🌆 | #3B82F6 blue |
| `TZAHARON_PRIVATE_SUPERVISED` | 🚐 | #22C55E green |
| `TZAHARON_PRIVATE_UNSUPERVISED` | 🚐 | #F97316 orange |
| `UNSPECIFIED` | 📍 | #6B7280 gray |

#### 2e. Age Toggle Filter (0–3 / 3+)

A bold, prominent toggle at the top of the map UI. Both options can be selected simultaneously (UI nudges toward picking one).

- Filters by `min_age_months` / `max_age_months` on the gan record
- `0–3`: show ganim where `max_age_months <= 36` (or null)
- `3+`: show ganim where `min_age_months >= 36` (or null, for tzaharon types)
- Default: both selected (show all)

**Changes:**
- `src/types/filters.ts` — add `age_track: ('0-3' | '3+')[] | null` to `GanFilters`
- `src/lib/apply-filters.ts` — filter logic
- `src/components/layout/FilterPanel.tsx` — toggle UI

#### 2f. Category Filter

Allow filtering by gan type on the map (multi-select chips).

**Changes:**
- `src/types/filters.ts` — add `categories: GanCategory[] | null`
- `src/lib/apply-filters.ts` — filter logic
- `src/components/layout/FilterPanel.tsx` — type filter UI with icons

#### 2g. Suggest a Gan — Support All Types

`src/components/gan/SuggestGanModal.tsx` must expose all types from the full type table, with correct sub-fields per type:
- Type picker: all `GanCategory` values (with Hebrew labels)
- Conditional sub-fields:
  - `MISHPACHTON` → show `mishpachton_affiliation` picker (TAMAT / PRIVATE)
  - `PRIVATE_GAN` → show `private_supervision` picker (SUPERVISED / NOT_SUPERVISED)
  - `MUNICIPAL_GAN` → show `municipal_grade` picker (TTAH / TAH / HOVA)
  - `TZAHARON_PRIVATE_*` → type is already the supervision signal, no extra picker

---

### 3. Fix Cluster 200/50 Bug

**Problem:** The map shows 200 ganim in a cluster, but clicking it shows only 50. This is a cap/default mismatch between the clustering display count and the actual data loaded.

**Fix:** Align the cluster label count with the actual number of ganim loaded in the viewport. Either increase the load cap to match the cluster display, or cap the cluster label to match what's actually loaded.

**Files likely involved:** `src/hooks/useViewportGanim.ts`, `src/components/map/MapContainer.tsx`

---

### 4. Shareable Gan URL

**What:** A "Copy link" button on every gan detail panel that generates a shareable URL for that specific gan.

**URL structure:** `/gan/[id]` — a new Next.js dynamic route

**Requirements:**
- `src/app/gan/[id]/page.tsx` — new server-side page that loads the gan and renders it
- OG meta tags (name, type, address, city) so the link preview looks good in WhatsApp/iMessage
- The page loads the gan detail and allows the user to interact (same UX as clicking a pin on the map, ideally)
- Copy link button in the gan detail panel (`src/components/gan/GanDetail.tsx`)

---

### 5. Filter by Rating

**What:** A hard filter chip in the filter panel: "מדורג בלבד" or a minimum stars slider.

**Behavior:**
- Filters out ganim with `avg_rating = null` or below threshold
- If results are sparse after filtering, show an inline nudge: _"מעט דירוגים באיזור זה — עזרו לנו לשפר"_ (not a hard error, just a soft message)
- No "beta" label on the filter chip itself — just let it work

**Changes:**
- `src/types/filters.ts` — add `min_rating: number | null`
- `src/lib/apply-filters.ts` — filter logic
- `src/components/layout/FilterPanel.tsx` — rating filter UI

---

### 6. Reviews — `review_scope` (גן + צהרון combined only)

**When it applies:** Only **`TZAHARON_MUNICIPAL`** — the single category that is **both** a morning municipal gan and an afternoon tzaharon at the same place (see [GAN_TYPES.md](GAN_TYPES.md): `MUNICIPAL_GAN` = בוקר בלבד; private tzaharon types = עצמאי). Parents may be rating the morning gan, the tzaharon, or the full-day experience; `review_scope` records which so one star rating is not ambiguous.

**Modal (`GanReviewModal.tsx`):** Scope picker with **"הגן (בוקר)"**, **"הצהרון"**, **"שניהם"** — default **"שניהם"**.

**Data path:**
- On submit: pass `review_scope` through **`/api/reviews`** into `user_inputs` metadata (same triage flow as today).
- On promotion: copy into **`confirmed_reviews`** as a typed column (not only JSON) — e.g. `process_user_inputs.py` on approval.
- DB: migration adding `review_scope` on `confirmed_reviews`.

**Display (`GanDetail.tsx`):** Small badge on each review — **"ביקורת על הצהרון"** / **"ביקורת על הגן (בוקר)"** / **"גן + צהרון"** — only for **`TZAHARON_MUNICIPAL`** reviews.

**Deferred (v3.1+):** Split rating header (separate averages per scope) once there is enough scoped data and design.

---

## Out of Scope for v3

| Item | Why |
|---|---|
| Hours filter UX changes | Intentionally deferred |
| Missing ganim / data completeness | Community will fill gaps organically |
| PWA "Add to home screen" push | → v3.1 |
| 3+ full dual-track experience (separate design language) | Requires more data + design work → v4 |
| צהרון as a sub-entity linked to municipal gan | Data modeling complexity → v4 |
| Referral loop | Still open from v2 backlog |
| Analytics dashboard | Operational, not product |

---

## v3.1 (Parked)

- **PWA "Add to home screen"** — surface the install prompt more prominently for mobile users

---

## v3.2 — Go-live glue, trust, and growth mechanics

**Why:** Most of v3’s map-and-discovery engineering can ship while this bucket stays implicit. v3.2 makes **launch, municipality-facing credibility, and campaign promises** explicit—so nothing critical is “missing from the plan” after landing + `review_scope` land.

### Verification and polish (ship-quality)

- **Cluster vs list parity** — QA large clusters so the count shown on the map matches what users can actually open in the list (historical “200 vs 50” class of bugs); fix any remaining cap mismatches in `MapContainer` / viewport fetch paths.
- **Share links in the wild** — confirm production **`metadataBase` / public site URL** so Open Graph previews for `/gan/[id]` look correct in WhatsApp and similar clients (`generateMetadata`, `site-url` helpers).
- **Sparse-results nudge** — optional copy when **rating filters** yield very few pins (per original v3 §5 intent): soft message, not an error.

### Trust, safety, and compliance surfaces

- **Legal / trust pages** — baseline **privacy**, **terms**, and plain-language explanation of **how contact-reviewer email relay works**, what is logged, and how abuse is handled (aligns with [PRODUCT_AUDIT.md](../PRODUCT_AUDIT.md) gaps). Enough for parents and for a municipal “this is not a rogue Facebook group” narrative.

### Contact reviewer and email operations

- **Production readiness** — `CONTACT_REVIEWER_ENABLED`, Resend (or equivalent) with a **verified sending domain**, `RESEND_FROM_EMAIL`, and operator clarity on triage if contact is abused.
- **Feature flag symmetry** — server vs client toggles documented and consistent for pilots.

### Data pipeline in production

- **`process_user_inputs` (or realtime)** — documented runbook: approved rows that are not fast-pathed in API routes must **materialize** predictably so “I submitted a review/edit” matches what others see ([database.md](./database.md)).

### Incentives that must match the product

- If marketing promises **Founding Parent** status, **badges**, or **permanent VIP** (no Give-to-Get), v3.2 includes **entitlement/admin design** so campaigns do not over-promise vs `user_access_entitlements` and flags ([GIVE_TO_GET_ACCESS_MODEL.md](../GIVE_TO_GET_ACCESS_MODEL.md)).

### Owner / operator track (early growth)

- **“Claim your gan”** (or equivalent) — owners verify listing, correct details, optional photos, and a path to respond to parent-facing signals; separate milestone from the parent map UX (see also [COLD_START_COMMUNITY_UTILITY.md](./COLD_START_COMMUNITY_UTILITY.md) Phase 5).

### Still later (do not fold into v3.2 unless scope expands)

- **Referral loop**, **analytics dashboard**, **split rating headers per `review_scope`** — remain aligned with [Out of Scope for v3](#out-of-scope-for-v3) / v4 unless explicitly pulled forward.

---

## Work Order (Suggested)

| # | Task | Why first |
|---|---|---|
| 1 | DB migration (enum + backfill) | Everything else depends on correct categories |
| 2 | Fix gov import script | Prevent re-importing wrong categories |
| 3 | TypeScript types + display functions | Unblocks map icons and filter work |
| 4 | Map icons + colors | Core visual identity of v3 |
| 5 | Age toggle + category filter | Ties the icon system into discovery |
| 6 | Fix cluster 200/50 bug | Quick win, fixes a confusing experience |
| 7 | Suggest a gan — all types | Enables community data for missing types |
| 8 | Filter by rating | Connects to the core "trusted by parents" hook |
| 9 | Shareable gan URL | PLG — enables sharing in WhatsApp |
| 10 | Landing + Explanatory page | TBD design; can be last since it wraps the product |
