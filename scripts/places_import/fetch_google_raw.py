#!/usr/bin/env python3
"""
Fetch all relevant places in Givatayim from Google Places API
and save them as a raw CSV for review before importing.

Usage:
  python fetch_google_raw.py [--force]

Output:
  scripts/places_import/out/google_raw.csv

The CSV contains one row per unique Google place with its original
google_primary_type. Review this file, then tell the agent how to
map each type to a place category (or skip it) before running
import_from_google_csv.py.

COST: ~$0.50-0.70 depending on how many query groups return results.
Re-running is blocked unless --force is passed (or the CSV is deleted).

Credentials loaded from root .env.local.
"""

import csv
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

GOOGLE_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

NEARBYSEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
FIELD_MASK = (
    "places.id,places.displayName,places.primaryType,"
    "places.internationalPhoneNumber,places.websiteUri,"
    "places.regularOpeningHours,places.location,places.formattedAddress"
)

GIVATAYIM_CENTER = {"latitude": 32.0702, "longitude": 34.8117}
GIVATAYIM_RADIUS = 2500.0  # meters

OUT_DIR = Path(__file__).parent / "out"
OUT_CSV = OUT_DIR / "google_raw.csv"

CSV_COLUMNS = [
    "google_place_id",
    "name",
    "google_primary_type",
    "query_group",
    "address",
    "lat",
    "lon",
    "phone",
    "website",
    "hours",
]

# Each tuple: (label for query_group column, list of Google includedTypes)
# Types are OR'd — a place matching ANY of them is returned.
# Keep groups thematically tight so the query_group label is meaningful.
QUERY_GROUPS = [
    ("cafe",             ["cafe", "coffee_shop"]),
    ("juice_tea",        ["juice_bar", "tea_house"]),
    ("dessert",          ["dessert_shop", "ice_cream_shop"]),
    ("bakery",           ["bakery"]),
    ("restaurant",       ["restaurant", "fast_food_restaurant", "meal_takeaway"]),
    ("restaurant_pizza", ["pizza_restaurant", "sandwich_shop", "hamburger_restaurant"]),
    ("restaurant_intl",  ["seafood_restaurant", "sushi_restaurant", "steak_house"]),
    ("restaurant_diet",  ["vegan_restaurant", "vegetarian_restaurant"]),
    ("restaurant_meal",  ["breakfast_restaurant", "brunch_restaurant"]),
    ("bar",              ["bar", "pub", "wine_bar", "night_club"]),
    ("medical",          ["doctor", "dentist", "physiotherapist"]),
    ("medical_more",     ["hospital", "optician", "nutritionist", "mental_health_practitioner"]),
    ("fitness",          ["gym", "swimming_pool"]),
    ("studio",           ["yoga_studio", "pilates_studio", "dance_studio"]),
    ("beauty",           ["spa", "beauty_salon", "hair_salon"]),
    ("beauty_more",      ["nail_salon", "barber_shop", "tanning_studio"]),
    ("attraction",       ["tourist_attraction", "museum", "art_gallery", "cultural_center"]),
    ("park",             ["park", "playground", "sports_complex"]),
    ("entertainment",    ["movie_theater", "bowling_alley", "amusement_park"]),
]


def search_nearby(types: list[str]) -> list[dict]:
    resp = requests.post(
        NEARBYSEARCH_URL,
        headers={
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": FIELD_MASK,
            "Content-Type": "application/json",
        },
        json={
            "includedTypes": types,
            "maxResultCount": 20,
            "languageCode": "iw",
            "locationRestriction": {
                "circle": {
                    "center": GIVATAYIM_CENTER,
                    "radius": GIVATAYIM_RADIUS,
                }
            },
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("places", [])


def place_to_row(gplace: dict, query_group: str) -> dict:
    loc = gplace.get("location", {})
    descs = gplace.get("regularOpeningHours", {}).get("weekdayDescriptions", [])
    return {
        "google_place_id": gplace.get("id", ""),
        "name": (gplace.get("displayName") or {}).get("text", ""),
        "google_primary_type": gplace.get("primaryType", ""),
        "query_group": query_group,
        "address": gplace.get("formattedAddress", ""),
        "lat": loc.get("latitude", ""),
        "lon": loc.get("longitude", ""),
        "phone": gplace.get("internationalPhoneNumber", ""),
        "website": gplace.get("websiteUri", ""),
        "hours": " | ".join(descs),
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    force = "--force" in sys.argv

    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not found. Add it to .env.local or set it in your shell.")
        return 1

    if OUT_CSV.exists() and not force:
        print(f"ERROR: {OUT_CSV} already exists.")
        print("  Delete it or pass --force to re-fetch (costs ~$0.50-0.70).")
        return 1

    OUT_DIR.mkdir(exist_ok=True)

    seen_ids: set[str] = set()
    rows: list[dict] = []

    for label, types in QUERY_GROUPS:
        print(f"  [{label}] querying {types}...", end=" ", flush=True)
        try:
            places = search_nearby(types)
            new = 0
            for p in places:
                gid = p.get("id", "")
                if gid in seen_ids:
                    continue
                seen_ids.add(gid)
                rows.append(place_to_row(p, label))
                new += 1
            print(f"{len(places)} results, {new} new")
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
        time.sleep(0.3)

    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nSaved {len(rows)} unique places to {OUT_CSV}")
    print("Open in Excel, review the google_primary_type column,")
    print("then tell the agent how to map each type to a place category.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
