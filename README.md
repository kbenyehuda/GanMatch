# GiveMyTime | גבעתיים

A map-centric discovery platform for places, services, and businesses in Giv'atayim, Israel — including licensed daycares (ages 0–3), doctors, cosmetics, and more — based on government data and community "Give-to-Get" reviews.

**Docs:** [docs/README.md](docs/README.md) · **Supabase schema, migrations, ingestion:** [docs/database.md](docs/database.md) · **Access model:** [GIVE_TO_GET_ACCESS_MODEL.md](GIVE_TO_GET_ACCESS_MODEL.md)

## Tech Stack

- **Framework:** Next.js (App Router) with TypeScript
- **Styling:** Tailwind CSS + Shadcn-style components
- **Database/Auth:** Supabase (PostgreSQL + PostGIS for spatial queries)
- **Map:** Mapbox GL JS (`react-map-gl`)
- **Icons:** Lucide React
- **Languages:** Hebrew (RTL) and English

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` → `.env.local` and fill values (project root), or set them as system environment variables:

```env
# Mapbox - Get a free token at https://account.mapbox.com/
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_token

# Supabase - Create project at https://supabase.com (choose Israel / Tel Aviv region)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Contact reviewer (email relay)
# Server-side only (do NOT expose to the browser)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
RESEND_API_KEY=re_your_resend_key
# Sending domain: givemytimeapp.com (bought 2026-09-05, used only for outbound mail — not hosting)
RESEND_FROM_EMAIL="GiveMyTime <noreply@givemytimeapp.com>"
ADMIN_EMAILS="admin1@example.com,admin2@example.com"
MODERATION_BLACKLIST_TERMS="competitor_name,bad_word"
MODERATION_PRICE_CHANGE_THRESHOLD_PCT=35
MODERATION_LOCATION_CHANGE_KM=2
MODERATION_MIN_APPROVED_EDITS_FOR_AUTO_APPROVE=3

# Feature toggles
# Server-side toggle (API route)
CONTACT_REVIEWER_ENABLED=false
# Client-side toggle (UI)
NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED=true

# Give-to-Get: when false, any logged-in user can read reviews (no ledger check).
# When true, use ENTITLEMENT_* and FF_BOUNTY_UNLOCK / FF_ONBOARDING_UNLOCK — see .env.example and GIVE_TO_GET_ACCESS_MODEL.md
# FF_SOFT_GATE=false
```

Full list of entitlement env vars: **`.env.example`** (includes `FF_SOFT_GATE`, `ENTITLEMENT_*`, unlock flags).

**If using system env vars on Windows:** Open a new terminal (or restart your IDE) after setting them—the running process won't see changes until it restarts. Then run `npm run dev`.

## Production secrets (recommended: Vercel)

- **Where to store secrets**: put all values from `.env.example` into your hosting provider’s Environment Variables UI (Vercel: Project → Settings → Environment Variables). Do **not** commit `.env.local` / `.env.production` etc.
- **Public vs secret**:
  - `NEXT_PUBLIC_*` variables are **exposed in the browser bundle**.
  - Keep **secrets** server-only (no `NEXT_PUBLIC_` prefix): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAILS`, `MODERATION_*`.

### Moderation CFG (editable file)

Tune guardrails in `config/moderation.json` (loaded by `src/lib/moderation/moderation-config.ts`): blacklist terms, thresholds (price, location, staff ratio, edit rate, min text length, …), reputation (min approved edits, trusted OAuth providers, email verified), logic guards (phone format, age range), and directionality multipliers. The committed file is the source of truth for shape and examples.

`MODERATION_*` env vars remain as fallback defaults if the JSON file is missing or partial.

- **Env separation**: Use separate values for **Preview** and **Production** where needed (Vercel supports per-environment vars). Consider a separate Supabase project for production vs dev.
- **Contact reviewer**: Keep `CONTACT_REVIEWER_ENABLED=false` until `RESEND_*` and your sending domain are ready. When enabled, messages are relayed; reviewer emails are not exposed to the sender.

### 3. Supabase project

Point `.env.local` at a Supabase project whose schema matches this repo. To create or refresh that schema from scratch, apply **`supabase/migrations/`** in timestamp order—full notes, tables, seeds, and cleanup migrations are in **[docs/database.md](docs/database.md)**.

### 4. Run dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

**Background worker (optional for local dev):** approved rows that are not fast-pathed in an API route are merged by `scripts/user_inputs/process_user_inputs.py` — see [docs/database.md](docs/database.md). Root `package.json` defines `npm run process-user-inputs` (and `:watch` / `:realtime`) to run it.

## Project structure

```
src/
├── app/
│   ├── layout.tsx, page.tsx, globals.css
│   ├── api/              # Route handlers (ganim, reviews, geocode, entitlements, admin triage, contact-reviewer, telemetry)
│   ├── admin/triage/     # Moderator UI
│   ├── manifest.ts, icon.tsx, apple-icon.tsx
│   └── ...
├── components/
│   ├── auth/             # AuthButton, ConnectionGate
│   ├── gan/              # GanDetail, DargaCalculator, review/edit/suggest modals, …
│   ├── layout/           # SearchResultsPanel, FilterPanel
│   ├── map/              # MapContainer
│   ├── pwa/              # Service worker registration
│   └── ui/               # Shadcn-style primitives (button, card, stars, …)
├── hooks/                # e.g. useViewportGanim
├── lib/
│   ├── entitlements/     # Soft gate + grants
│   ├── moderation/     # Edit approval (validation engine, config)
│   ├── telemetry/      # Server-side event logging
│   ├── env/              # public.ts + server.ts (feature flags, secrets)
│   ├── darga-calculator.ts, ganim-api.ts, supabase.ts, utils.ts, …
└── types/
    └── ganim.ts, filters.ts, search.ts
```

## Features

- **Map-centric UI** – Map fills the screen; search panel (desktop) or bottom sheet (mobile) overlays
- **Location-based search** – PostGIS `get_ganim_in_bbox()` returns daycares in the current viewport
- **Gan detail view** – Licensing-style fields, address, phones; reviews gated by **`FF_SOFT_GATE`** and entitlements when the soft gate is on (any logged-in user can read when it is off). When the gate is off, **`GET /api/entitlements/me`** may still report `has_full_access: false`; use **`can_view_reviews`** for read access.
- **Darga calculator** – Estimated subsidy from Ministry of Labor 2025–2026 tables (placeholder brackets)

## Product direction

Ongoing work and risks: [PRODUCT_AUDIT.md](PRODUCT_AUDIT.md). Historical Q2 milestone text: [docs/graveyard/ROADMAP_Q2.md](docs/graveyard/ROADMAP_Q2.md). Retired DB naming and tables: [docs/graveyard/](docs/graveyard/).
