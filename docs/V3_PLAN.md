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

## Progress snapshot (vs work order below)

Tracked against the numbered **Work Order** at the end of this doc. Status reflects **this repository** as of the last doc update (verify after large merges).

| # | Task | Status |
|---|------|--------|
| 1 | DB migration (enum + backfill) | **Done** — `supabase/migrations/20260328000000_v3_gan_category_tzaharon.sql` |
| 2 | Fix gov import script | **Done** — `scripts/gov_import/import_maon_symbol_datagovil.py` maps `maon_type_code` |
| 3 | TypeScript types + display | **Done** — `src/types/ganim.ts`, `src/lib/gan-display.ts` |
| 4 | Map icons + colors | **Done** — `src/components/map/MapContainer.tsx` (`getGanPinConfig`) |
| 5 | Age toggle + category filter | **Done** — `FilterPanel`, `apply-filters`, `filters.ts` |
| 6 | Cluster count vs opened list | **Done** — cluster click uses full cluster size for `getLeaves` in `MapContainer.tsx` |
| 7 | Suggest a gan — all types | **Done** — `SuggestGanModal.tsx` (+ related API paths) |
| 8 | Filter by rating | **Done** — `min_rating` / rated-only + soft nudge in `SearchResultsPanel.tsx` when few matches |
| 9 | Shareable gan URL | **Done** — `src/app/gan/[id]/page.tsx`, share/copy in `GanDetail.tsx`, `src/lib/site-url.ts` |
| 10 | Landing + explanatory page | **Not started** — app home is still map-only (`src/app/page.tsx` → `HomeMap`); no `/about` or `/how-it-works` route yet |
| 11 | Reviews — `review_scope` | **Not started** — no column/API/UI wired end-to-end yet (see §6, [GAN_TYPES.md](GAN_TYPES.md)) |
| 12 | Contact reviewer modal — touch UX | **Not started** — see §7 |
| 13 | Search panel collapse / tablet | **Not started** — see §8 |
| 14 | Gan attribute icons — tap + legend | **Not started** — see §9 |

**Note on item 10:** If you expected landing + about to be done, they are **not present under `src/app/`** today (only `/`, `/gan/[id]`, `/admin/triage`). Treat §1 as the remaining “wrap the product” milestone.

---

## Features

---

### 1. Landing + Explanatory Page

**Status:** **Not started** — design-first; no dedicated routes or in-app links yet (map remains the default home).

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

**Status:** **Done** in this repo (DB, import, types, map, filters, suggest). Canonical reference: [GAN_TYPES.md](GAN_TYPES.md).

This was the largest feature in v3. It touches the DB, import pipeline, TypeScript types, map rendering, and the suggest flow.

#### 2a. DB Migration

**Historical note:** Before v3, gov rows were often stored as `MAON_SYMBOL` regardless of `maon_type_code`. **Shipped** migration (excerpt; see file for full):

**Migration (reference — applied in repo):**

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

#### 2b. Gov Import Script

**Done.** `scripts/gov_import/import_maon_symbol_datagovil.py` sets `category` from `maon_type_code`:
- `0` → `MAON_SYMBOL`
- `1` → `MISHPACHTON` + `mishpachton_affiliation = TAMAT`
- `2` → `TZAHARON_MUNICIPAL`

#### 2c. TypeScript Types

**Done.** `GanCategory` includes the three `TZAHARON_*` values in `src/types/ganim.ts`. Hebrew labels for `formatGanCategoryHe()` / related helpers live in `src/lib/gan-display.ts`.

#### 2d. Map Icons + Colors

**Done.** `src/components/map/MapContainer.tsx` maps icon + color per `category` (and sub-fields where relevant) per `GAN_TYPES.md`. Emoji pins today; custom SVG assets remain optional design follow-up.

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

**Changes (done):**
- `src/types/filters.ts` — `age_track` on `GanFilters`
- `src/lib/apply-filters.ts` — filter logic
- `src/components/layout/FilterPanel.tsx` — toggle UI

#### 2f. Category Filter

**Done.** Multi-select type chips: `filters.categories`, `apply-filters`, `FilterPanel`.

#### 2g. Suggest a Gan — Support All Types

**Done.** `src/components/gan/SuggestGanModal.tsx` exposes types and sub-fields per type:
- Type picker: all `GanCategory` values (with Hebrew labels)
- Conditional sub-fields:
  - `MISHPACHTON` → show `mishpachton_affiliation` picker (TAMAT / PRIVATE)
  - `PRIVATE_GAN` → show `private_supervision` picker (SUPERVISED / NOT_SUPERVISED)
  - `MUNICIPAL_GAN` → show `municipal_grade` picker (TTAH / TAH / HOVA)
  - `TZAHARON_PRIVATE_*` → type is already the supervision signal, no extra picker

---

### 3. Fix Cluster 200/50 Bug

**Status:** **Done.** Opening a cluster passes the cluster’s point count into `getLeaves`, so the list can include every pin in that cluster (see `MapContainer.tsx`).

**Original issue:** The map showed N ganim on a cluster bubble, but only 50 appeared after tap (default leaf limit).

**Regression check:** If counts ever diverge again, compare viewport fetch limits with clustering input and cluster leaf limit.

---

### 4. Shareable Gan URL

**Status:** **Done.**

**What:** A "Copy link" / share control on the gan detail panel and a stable URL per gan.

**URL structure:** `/gan/[id]` — a new Next.js dynamic route

**Shipped:**
- `src/app/gan/[id]/page.tsx` — server page + `generateMetadata` for previews
- OG-oriented metadata (title, description, canonical) via `src/lib/site-url.ts`
- Map deep-link focus for shared URLs
- Share/copy affordance in `src/components/gan/GanDetail.tsx`

---

### 5. Filter by Rating

**Status:** **Done** (filters + soft nudge when few rated results in view).

**What:** "מדורג בלבד" and minimum stars in the filter panel.

**Behavior:**
- Filters out ganim with `avg_rating = null` or below threshold
- If results are sparse after filtering, show an inline nudge: _"מעט דירוגים באיזור זה — עזרו לנו לשפר"_ (not a hard error, just a soft message)
- No "beta" label on the filter chip itself — just let it work

**Implemented in:** `src/types/filters.ts`, `src/lib/apply-filters.ts`, `src/components/layout/FilterPanel.tsx`, nudge copy in `src/components/layout/SearchResultsPanel.tsx`.

---

### 6. Reviews — `review_scope` (גן + צהרון combined only)

**Status:** **Not started** — spec only; see [GAN_TYPES.md](GAN_TYPES.md) (planned behavior).

**When it applies:** Only **`TZAHARON_MUNICIPAL`** — the single category that is **both** a morning municipal gan and an afternoon tzaharon at the same place (see [GAN_TYPES.md](GAN_TYPES.md): `MUNICIPAL_GAN` = בוקר בלבד; private tzaharon types = עצמאי). Parents may be rating the morning gan, the tzaharon, or the full-day experience; `review_scope` records which so one star rating is not ambiguous.

**Modal (`GanReviewModal.tsx`):** Scope picker with **"הגן (בוקר)"**, **"הצהרון"**, **"שניהם"** — default **"שניהם"**.

**Data path:**
- On submit: pass `review_scope` through **`/api/reviews`** into `user_inputs` metadata (same triage flow as today).
- On promotion: copy into **`confirmed_reviews`** as a typed column (not only JSON) — e.g. `process_user_inputs.py` on approval.
- DB: migration adding `review_scope` on `confirmed_reviews`.

**Display (`GanDetail.tsx`):** Small badge on each review — **"ביקורת על הצהרון"** / **"ביקורת על הגן (בוקר)"** / **"גן + צהרון"** — only for **`TZAHARON_MUNICIPAL`** reviews.

**Deferred (v3.1+):** Split rating header (separate averages per scope) once there is enough scoped data and design.

---

### 7. Contact reviewer modal — tablet / phone UX

**Status:** **Not started** (improvements below still the target).

**Problem:** On iPad and phones, the “שלח הודעה לממליץ” flow is hard to use: the modal competes with the gan detail sheet, lacks a strong scrim, and can feel clipped or cramped (fixed positioning inside scrollable ancestors can make this worse on WebKit).

**Direction:**
- Treat as a **full-screen or bottom-sheet style** dialog on small viewports / touch-first breakpoints, with **safe-area insets**, **scrollable body**, and a clear **dimmed backdrop**; tap outside to dismiss where appropriate.
- Prefer rendering the dialog in a **portal to `document.body`** so it is not clipped by `overflow` on the detail card or the home layout.
- Keep desktop as a compact centered card if that still reads well.

**Files likely involved:** `src/components/gan/ContactReviewerModal.tsx`, possibly `GanDetail.tsx` (mount point only).

---

### 8. Search panel and map — collapse / expand (drag optional)

**Status:** **Not started**.

**Goal:** Let users **hide the search UI** to see more map, and **bring it back** without losing context—especially on **tablet** (today the `md` breakpoint uses a fixed side panel like a small laptop, so there is no bottom-sheet drag).

**Direction:**
- **Tablet / medium widths:** Either extend the **mobile bottom sheet + drag handle** behavior up to a higher breakpoint (e.g. `lg`), or add an explicit **collapse / expand** control (and optional **edge drag**) for the search column so the map uses full width when search is tucked away.
- **Desktop:** Optional **collapse to a slim tab** or icon strip that re-opens the search panel; persist preference in `localStorage` if it improves repeat use.
- **“Same for the map”:** Interpret as **more map real estate when chrome is hidden**, not necessarily a second draggable map layer—unless you later want a **resizable split** (heavier scope; call out as optional follow-up).

**Files likely involved:** `src/components/layout/SearchResultsPanel.tsx`, `src/components/home/HomeMap.tsx` (breakpoints, offsets when panel width changes).

---

### 9. Gan attribute icons — touch + “(?)” legend

**Status:** **Not started** (tooltips only today).

**Problem:** In `GanAttributeIcons`, meaning is mostly in **`title` tooltips** — fine on desktop with hover, **invisible on phone / iPad**.

**Direction:**
- **Tap an icon** → show its explanation (inline expansion, popover, or small bottom chip)—same Hebrew labels as today, without relying on hover.
- Add a **(?)** control next to the icon row that opens a **full legend** (modal or slide-over) listing **all attribute icons and what they mean** (ארוחות, כשרות, שפות, חוגים, מקום פנוי, וכו׳).
- **Single source of truth** for copy: shared between the in-app legend and the future **general info / about** section (see §1). Prefer a small static route (e.g. `/about/gan-icons`) that mirrors the legend so links from marketing or municipality materials stay stable.

**Files likely involved:** `src/components/gan/GanAttributeIcons.tsx`, `src/components/gan/GanDetail.tsx`, `src/components/layout/SearchResultsPanel.tsx` (list cards reuse icons), new `src/app/about/...` page when §1 lands.

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

- **Cluster vs list parity** — Primary fix shipped in `MapContainer` (leaf limit matches cluster size); keep an occasional **smoke test** on huge clusters after viewport/limit changes.
- **Share links in the wild** — confirm production **`metadataBase` / public site URL** so Open Graph previews for `/gan/[id]` look correct in WhatsApp and similar clients (`generateMetadata`, `site-url` helpers).
- **Sparse-results nudge** — **Shipped** in-app when rating filters are on and few ganim match (`SearchResultsPanel`); revisit copy/threshold if needed.

### Trust, safety, and compliance surfaces

- **Legal / trust pages** — baseline **privacy**, **terms**, and plain-language explanation of **how contact-reviewer email relay works**, what is logged, and how abuse is handled (aligns with [PRODUCT_AUDIT.md](../PRODUCT_AUDIT.md) gaps). Enough for parents and for a municipal “this is not a rogue Facebook group” narrative.

### Contact reviewer and email operations

- **Modal UX on touch devices** — see **[§7](#7-contact-reviewer-modal--tablet--phone-ux)** (layout, portal, scrim); v3.2 here covers **backend, flags, and policy**.
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

| # | Task | Status | Why first |
|---|------|--------|-----------|
| 1 | DB migration (enum + backfill) | Done | Everything else depends on correct categories |
| 2 | Fix gov import script | Done | Prevent re-importing wrong categories |
| 3 | TypeScript types + display functions | Done | Unblocks map icons and filter work |
| 4 | Map icons + colors | Done | Core visual identity of v3 |
| 5 | Age toggle + category filter | Done | Ties the icon system into discovery |
| 6 | Fix cluster 200/50 bug | Done | Quick win, fixes a confusing experience |
| 7 | Suggest a gan — all types | Done | Enables community data for missing types |
| 8 | Filter by rating | Done | Connects to the core "trusted by parents" hook |
| 9 | Shareable gan URL | Done | PLG — enables sharing in WhatsApp |
| 10 | Landing + Explanatory page | **Not started** | Wraps the product; still map-only home |
| 11 | Reviews — `review_scope` | **Not started** | Unambiguous stars for גן+צהרון (see §6) |
| 12 | Contact reviewer modal — tablet/phone UX | **Not started** | Core differentiator must work on touch (see §7); complements v3.2 contact ops |
| 13 | Search panel collapse / tablet sheet | **Not started** | More map + optional drag (see §8) |
| 14 | Gan attribute icons — tap + (?) legend | **Not started** | Touch parity + link to `/about` content (see §9) |

See **[Progress snapshot](#progress-snapshot-vs-work-order-below)** above for file pointers and notes.
