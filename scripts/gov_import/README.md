## data.gov.il importer (MAON_SYMBOL)

This folder contains a safe-by-default importer that pulls supervised daycare records from `data.gov.il` and upserts them into `public.ganim_v2`.

### Prereqs

- Install Python deps (already used by other scripts):

```bash
pip install -r scripts/scraper/requirements.txt
```

### Environment

The script loads repo-root `.env.local`.

- **Mapbox**: `MAPBOX_ACCESS_TOKEN` or `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
- **Supabase**:
  - Dry-run: only needs `SUPABASE_URL` if you want, but not required
  - Write-mode: requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- **data.gov.il** (optional): `DATAGOVIL_MAON_RESOURCE_ID`

### Run (recommended flow)

Dry-run on one city (no DB writes, capped geocoding):

```bash
python scripts/gov_import/import_maon_symbol_datagovil.py --city "גבעתיים" --dry-run --max-geocodes 25
```

Write mode (requires the migration that adds `upsert_ganim_v2`):

```bash
python scripts/gov_import/import_maon_symbol_datagovil.py --city "גבעתיים" --write --max-geocodes 150
```

By default, rows that can’t be geocoded are **skipped**. To allow city-center fallback points:

```bash
python scripts/gov_import/import_maon_symbol_datagovil.py --city "גבעתיים" --write --allow-fallback
```

