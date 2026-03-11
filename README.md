# GanMatch | גן מתאים

A map-centric discovery platform for Israeli daycares (ages 0–3). Find licensed daycares based on government data and community "Give-to-Get" reviews.

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
RESEND_FROM_EMAIL="GanMatch <noreply@yourdomain.com>"
ADMIN_EMAILS="admin1@example.com,admin2@example.com"

# Feature toggles
# Server-side toggle (API route)
CONTACT_REVIEWER_ENABLED=true
# Client-side toggle (UI)
NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED=true
```

**If using system env vars on Windows:** Open a new terminal (or restart your IDE) after setting them—the running process won't see changes until it restarts. Then run `npm run dev`.

## Production secrets (recommended: Vercel)

- **Where to store secrets**: put all values from `.env.example` into your hosting provider’s Environment Variables UI (Vercel: Project → Settings → Environment Variables). Do **not** commit `.env.local` / `.env.production` etc.
- **Public vs secret**:
  - `NEXT_PUBLIC_*` variables are **exposed in the browser bundle**.
  - Keep **secrets** server-only (no `NEXT_PUBLIC_` prefix): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_EMAILS`.
- **Env separation**:
  - Use separate values for **Preview** and **Production** where needed (Vercel supports per-environment vars).
  - Consider a separate Supabase project for production vs dev.
- **Contact reviewer feature**:
  - Keep `CONTACT_REVIEWER_ENABLED=false` until you have `RESEND_*` configured and your sending domain verified.
  - When enabled, messages are relayed; reviewer emails are not exposed to the sender.

### 3. Database setup

Run the SQL migration in your Supabase project:

1. Open Supabase Dashboard → SQL Editor
2. Run the contents of `supabase/migrations/20260227000000_initial_schema.sql`
3. Run the newer migrations in `supabase/migrations/` (in timestamp order), including:
   - `20260228000000_review_limits.sql` (max 10 reviews per user)
   - `20260228001000_review_contact_messages.sql` (logs “contact reviewer” messages)
3. (Optional) Run simulated data: `supabase/seed/seed_simulated_ganim.sql` (adds 7 fake daycares for dev/testing only)

This creates:

- **ganim** – Daycares with PostGIS `location`, licensing data, metadata (JSONB)
- **reviews** – Give-to-Get community reviews
- **visit_notes** – Short contributions that unlock review visibility
- **waitlist_reports** – Community-reported availability (Available / Limited / Full)

### 4. Run dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
├── app/
│   ├── layout.tsx    # Root layout (RTL, Hebrew fonts)
│   ├── page.tsx      # Main map + search + gan detail
│   └── globals.css
├── components/
│   ├── gan/
│   │   ├── GanDetail.tsx   # Pin detail view with licensing + Darga calculator
│   │   └── DargaCalculator.tsx  # Ministry of Labor subsidy estimator
│   ├── layout/
│   │   └── SearchResultsPanel.tsx  # Side panel / bottom sheet
│   ├── map/
│   │   └── MapContainer.tsx  # Mapbox map with pins
│   └── ui/   # Button, Card (Shadcn-style)
├── lib/
│   ├── darga-calculator.ts  # 2025–2026 subsidy brackets (placeholder)
│   ├── ganim-api.ts        # Fetch ganim by bounding box
│   ├── supabase.ts         # Supabase client
│   └── utils.ts
└── types/
    └── ganim.ts
```

## Features

- **Map-centric UI** – Map fills the screen; search panel (desktop) or bottom sheet (mobile) overlays
- **Location-based search** – PostGIS `get_ganim_in_bbox()` returns daycares in the current viewport
- **Gan detail view** – Government licensing data, address, phones; Give-to-Get blurred reviews
- **Darga calculator** – Estimated subsidy from Ministry of Labor 2025–2026 tables (placeholder brackets)

## Canonical data model (v2 categories) + edit flow

The app is moving toward a **category-first** model that is developer-intuitive and matches the Hebrew UI.

### Canonical table: `public.ganim_v2`

`ganim_v2` is the **canonical** “one row per gan” table that the app reads from via RPCs.

- **Core**: `name_he`, `location`, `address` (street + number), `city`
- **Category**: `category` plus exactly **one** dependent add-on field (see below)
- **CCTV**:
  - `has_cctv` (boolean)
  - `cctv_streamed_online` (boolean nullable; meaningful only when `has_cctv=true`)
- **Price & ages**:
  - `monthly_price_nis` (numeric)
  - `min_age_months`, `max_age_months` (ints)

### Category logic (Hebrew UI)

The UI shows `סוג` and then **only the add-on that matches the chosen category**:

1) **מעון סמל** (`category = MAON_SYMBOL`)
   - add-on: **סמל מעון** (`maon_symbol_code`)
2) **גן פרטי** (`category = PRIVATE_GAN`)
   - add-on: **פיקוח** (`private_supervision`: 🛡️ מפוקח / לא מפוקח / לא ידוע)
3) **משפחתון** (`category = MISHPACHTON`)
   - add-on: **שיוך** (`mishpachton_affiliation`: פרטי / תמ״ת / לא ידוע)
4) **גן עירוני** (`category = MUNICIPAL_GAN`)
   - add-on: **שכבה** (`municipal_grade`: טט״ח / ט״ח / חובה / לא ידוע)

This prevents invalid combinations like “גן עירוני” with “🛡️ מפוקח”.

### Deterministic backfill (Step A)

To populate `ganim_v2` from existing imported data, we run a deterministic backfill migration:

- Extracts `סמל מעון: ####` from text into `maon_symbol_code` (and sets category to `MAON_SYMBOL`).
- Infers `category` conservatively from text signals (e.g., “משפחתון”, “גן עירייה/עירוני”, “פרטי”).
- Backfills dependent add-ons to `UNKNOWN` when category is known but add-on cannot be inferred.
- Backfills CCTV columns from `metadata.cctv_access` (none/exceptional/online).

Migration: `supabase/migrations/20260302006000_backfill_ganim_v2_from_metadata.sql`

### Read RPCs switched to `ganim_v2`

The existing RPC names are preserved, but their source is now `ganim_v2`:

- `get_all_ganim(p_limit)`
- `get_ganim_in_bbox(min_lon, min_lat, max_lon, max_lat, p_limit)`

Migration: `supabase/migrations/20260302005000_switch_rpcs_to_ganim_v2.sql`

### Editing gan data (auto-approve stub)

Users can edit gan fields from the UI (`GanDetail` → **ערוך פרטים**). The save flow is:

- Client calls `POST /api/ganim/edit` with a patch.
- Server runs a dummy approval function (currently always approves):
  - `src/lib/moderation/gan-edit-approval.ts`
- Server enforces category correctness:
  - keeps only the dependent add-on for the chosen category
  - clears all other dependent add-on columns to `NULL`
- Server writes updates to `public.ganim_v2` using the Supabase service role key.
- Request is logged in `public.gan_edit_requests`.

Migration: `supabase/migrations/20260302002000_gan_edit_requests.sql`

## Populating real data (Tel Aviv / Givatayim)

A Python scraper lives in `scripts/scraper/`:

```bash
cd scripts/scraper
pip install -r requirements.txt
playwright install chromium
# Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
# Run insert_gan RPC migration in Supabase
python scrape_tel_aviv_givatayim.py
```

If the municipal pages don't match the scraper's structure, use manual CSV import:

```bash
python import_from_csv.py your_data.csv
```

See `scripts/scraper/README.md` for full details.

## User inputs processor (user_inputs → ganim_v2)

User suggestions (new ganim), edits, and reviews are stored in `user_inputs`. A Python script processes them into `ganim_v2` and `confirmed_reviews`:

```bash
cd scripts/user_inputs
# Or from repo root:
pip install supabase python-dotenv  # if not already installed
```

**Run once:**
```bash
python process_user_inputs.py
```

**Run every 60 seconds (for development):**
```bash
python process_user_inputs.py --watch
```

**Run on relevant user_inputs changes in realtime (requires migration 20260307100008):**
```bash
python process_user_inputs.py --realtime
```

Realtime mode listens to `user_inputs` INSERT/UPDATE events and processes when rows can affect output
(for example when triage changes `status` to `approved`).

Requires `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.

## Next steps

1. **Auth** – Supabase Auth for login; wire `canViewReviews` to contribution check
2. **Darga tables** – Replace placeholder brackets in `src/lib/darga-calculator.ts` with official 2026 tables
3. **(Later) LLM review structuring** – Currently the app stores the single free-text recommendation into `reviews.advice_to_parents_text`. In the future we can use an LLM to split that text into structured fields (`pros_text`, `cons_text`, and `advice_to_parents_text`) and optionally auto-tag categories..
