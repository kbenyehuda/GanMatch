# GanMatch Scraper

Scrape daycare (ganim) data for Tel Aviv and Givatayim and import into Supabase.

## Setup

```bash
cd scripts/scraper
pip install -r requirements.txt
playwright install chromium
```

## Environment

Create `.env` (copy from `.env.example`):

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

Use **Service Role Key** (not anon) for insert permissions. Find it in Supabase Dashboard → Settings → API.

## Database

**Required:** Run the `insert_gan` RPC migration in Supabase SQL Editor:

```
supabase/migrations/20260227200000_insert_gan_rpc.sql
```

If inserts fail with "Could not find the function public.insert_gan", run this migration and reload: Supabase Dashboard → Settings → API → "Reload schema".

## Run Playwright Scraper

```bash
python scrape_tel_aviv_givatayim.py
```

**LLM extraction (recommended):** Add `OPENAI_API_KEY` to `.env` to use GPT for identifying daycare entries. The LLM reads the page content and extracts ganim by understanding the structure semantically, so it handles different page layouts and avoids brittle selectors. Uses `gpt-4o-mini` by default (set `OPENAI_MODEL` to override).

Without the key, the scraper falls back to rule-based HTML parsing.

## Import from Google My Maps (Givatayim)

For the [Givatayim daycares map](https://www.google.com/maps/d/u/0/viewer?mid=1Fu8muzSdopFv2SGzAZMb_xkd1Vp1x2A):

1. Open the map in Google My Maps
2. Click ⋮ (menu) → **Export to KML**
3. Download the KML file
4. Run: `python import_from_kml.py givatayim.kml --city "גבעתיים"`

This imports all placemarks with their coordinates (no geocoding needed).

## Import from CSV

When scraping fails or you have manual data:

1. Create a CSV with columns: `name_he,name_en,address,city,type,license_status,has_cctv,phone`
2. Run: `python import_from_csv.py your_file.csv`

See `ganim_import_example.csv` for format.

## Geocoding (no API key needed)

**Coordinate sources (in order):**
1. **Map links in the scraped HTML** – If the municipal page has Google Maps links (e.g. “לחצו למפה”), we extract lat/lon directly. No API.
2. **Nominatim** – OpenStreetMap’s free geocoder. No key. Respect 1 request/second.
3. **City center** – Fallback only when the above fail.

We can’t scrape Google Maps itself (ToS and blocking). The municipal pages often embed map links, so we get coordinates from there when they exist.
