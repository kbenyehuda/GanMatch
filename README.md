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

Copy `.env.local.example` to `.env.local` and fill in:

```env
# Mapbox - Get a free token at https://account.mapbox.com/
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_token

# Supabase - Create project at https://supabase.com (choose Israel / Tel Aviv region)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Database setup

Run the SQL migration in your Supabase project:

1. Open Supabase Dashboard → SQL Editor
2. Run the contents of `supabase/migrations/20260227000000_initial_schema.sql`

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

## Next steps

1. **Populate data** – Use a Python/Playwright scraper to import data from the [Ministry of Education daycare portal](https://www.gov.il/en/service/registration_for_day_care_centers_and_nurseries1)
2. **Auth** – Supabase Auth for login; wire `canViewReviews` to contribution check
3. **Darga tables** – Replace placeholder brackets in `src/lib/darga-calculator.ts` with official 2026 tables from [daycaresimulatordocuments.labor.gov.il](https://daycaresimulatordocuments.labor.gov.il) or Ministry of Labor docs
