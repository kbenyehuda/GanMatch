#!/usr/bin/env python3
"""
Import places from the Google raw CSV into the places table,
using a category mapping you define.

Usage:
  python import_from_google_csv.py [--dry-run]

The mapping is defined in TYPE_MAPPING below. Edit it after reviewing
google_raw.csv, then run this script.

Any google_primary_type mapped to None is skipped (not imported).
Places already in the DB (matched by google_place_id in attributes)
are skipped automatically.

Credentials loaded from root .env.local.
"""

import csv
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

IN_CSV = Path(__file__).parent / "out" / "google_raw.csv"

# ---------------------------------------------------------------------------
# EDIT THIS MAPPING after reviewing google_raw.csv.
# Keys = google_primary_type values from the CSV.
# Values = our place_category ('cafe','food','doctor','wellness','attraction','kids')
#          or None to skip.
# ---------------------------------------------------------------------------
TYPE_MAPPING: dict[str, str | None] = {
    # Cafes
    "cafe":                     "cafe",
    "coffee_shop":              "cafe",
    "juice_bar":                "cafe",
    "tea_house":                "cafe",
    # Food
    "restaurant":               "food",
    "fast_food_restaurant":     "food",
    "meal_takeaway":            "food",
    "pizza_restaurant":         "food",
    "sandwich_shop":            "food",
    "hamburger_restaurant":     "food",
    "seafood_restaurant":       "food",
    "sushi_restaurant":         "food",
    "steak_house":              "food",
    "vegan_restaurant":         "food",
    "vegetarian_restaurant":    "food",
    "breakfast_restaurant":     "food",
    "brunch_restaurant":        "food",
    "bakery":                   "food",
    "dessert_shop":             "food",
    "ice_cream_shop":           "food",
    # Bars — map to food (closest category we have)
    "bar":                      "food",
    "pub":                      "food",
    "wine_bar":                 "food",
    "night_club":               None,   # skip for now
    # Medical facilities → clinic (not individual doctors)
    "doctor":                   "clinic",
    "dentist":                  "clinic",
    "physiotherapist":          "clinic",
    "hospital":                 "clinic",
    "optician":                 "clinic",
    "nutritionist":             "clinic",
    "mental_health_practitioner": "clinic",
    # Pharmacy — skip for now
    "pharmacy":                 None,
    # Wellness
    "gym":                      "wellness",
    "swimming_pool":            "wellness",
    "yoga_studio":              "wellness",
    "pilates_studio":           "wellness",
    "dance_studio":             "wellness",
    "spa":                      "wellness",
    "beauty_salon":             "wellness",
    "hair_salon":               "wellness",
    "nail_salon":               "wellness",
    "barber_shop":              "wellness",
    "tanning_studio":           "wellness",
    # Attractions
    "tourist_attraction":       "attraction",
    "museum":                   "attraction",
    "art_gallery":              "attraction",
    "cultural_center":          "attraction",
    "park":                     "attraction",
    "playground":               "attraction",
    "sports_complex":           "attraction",
    "movie_theater":            "attraction",
    "bowling_alley":            "attraction",
    "amusement_park":           "attraction",
}


def fetch_existing_google_ids(supabase) -> set[str]:
    result = supabase.table("places").select("attributes").execute()
    ids: set[str] = set()
    for row in result.data or []:
        gid = (row.get("attributes") or {}).get("google_place_id")
        if gid:
            ids.add(gid)
    return ids


def fetch_existing_names(supabase) -> set[str]:
    result = supabase.table("places").select("name").execute()
    return {(r.get("name") or "").strip().lower() for r in result.data or []}


def insert_place(supabase, row: dict, category: str) -> str | None:
    lat = float(row["lat"]) if row.get("lat") else None
    lon = float(row["lon"]) if row.get("lon") else None
    if not lat or not lon:
        return None

    phone = [row["phone"]] if row.get("phone") else None

    resp = supabase.rpc("insert_community_place", {
        "p_name":        row["name"],
        "p_category":    category,
        "p_lon":         lon,
        "p_lat":         lat,
        "p_address":     row.get("address") or None,
        "p_description": None,
        "p_phone":       phone,
        "p_website":     row.get("website") or None,
        "p_hours":       row.get("hours") or None,
        "p_user_id":     None,
    }).execute()
    place_id = resp.data
    if not place_id:
        return None

    supabase.table("places").update({
        "source": "google",
        "is_verified": False,
        "attributes": {
            "google_place_id":   row["google_place_id"],
            "google_primary_type": row["google_primary_type"],
        },
    }).eq("id", place_id).execute()
    return place_id


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    dry_run = "--dry-run" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    if not IN_CSV.exists():
        print(f"ERROR: {IN_CSV} not found. Run fetch_google_raw.py first.")
        return 1

    with open(IN_CSV, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    print(f"Read {len(rows)} rows from CSV")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    existing_google_ids = fetch_existing_google_ids(supabase)
    existing_names = fetch_existing_names(supabase)
    print(f"{len(existing_google_ids)} places already in DB by google_place_id")

    # Summarise what will happen before doing anything
    by_type: dict[str, list] = {}
    for row in rows:
        t = row.get("google_primary_type", "unknown")
        by_type.setdefault(t, []).append(row)

    print("\nType breakdown (what's in the CSV):")
    unmapped: list[str] = []
    for t, items in sorted(by_type.items()):
        mapping = TYPE_MAPPING.get(t, "NOT IN MAPPING")
        status = "skip" if mapping is None else (mapping if mapping else "NOT IN MAPPING")
        flag = " <-- NOT MAPPED" if mapping == "NOT IN MAPPING" else ""
        print(f"  {t:40} {len(items):3} places -> {status}{flag}")
        if mapping == "NOT IN MAPPING":
            unmapped.append(t)

    if unmapped:
        print(f"\nWARNING: {len(unmapped)} type(s) not in TYPE_MAPPING — they will be skipped.")
        print("  Add them to TYPE_MAPPING in this script if you want them imported.")

    print()

    inserted = skipped_dup = skipped_mapping = errors = 0

    for row in rows:
        gid = row.get("google_place_id", "")
        name = row.get("name", "")
        ptype = row.get("google_primary_type", "")

        category = TYPE_MAPPING.get(ptype)  # None = skip, missing key = skip

        if category is None:
            skipped_mapping += 1
            continue

        if gid in existing_google_ids:
            skipped_dup += 1
            continue

        if name.strip().lower() in existing_names:
            skipped_dup += 1
            continue

        if dry_run:
            print(f"  [DRY RUN] {category:12} | {name}  ({ptype})")
            inserted += 1
            existing_names.add(name.strip().lower())
            continue

        try:
            place_id = insert_place(supabase, row, category)
            if place_id:
                print(f"  + {category:12} | {name}")
                existing_google_ids.add(gid)
                existing_names.add(name.strip().lower())
                inserted += 1
            else:
                print(f"  ? {name} — no ID returned", file=sys.stderr)
                errors += 1
        except Exception as e:
            print(f"  ERROR {name}: {e}", file=sys.stderr)
            errors += 1
        time.sleep(0.05)

    print(f"\nDone: {inserted} inserted, {skipped_dup} skipped (already in DB), "
          f"{skipped_mapping} skipped (mapping=skip/unmapped), {errors} errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
