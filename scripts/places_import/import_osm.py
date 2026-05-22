#!/usr/bin/env python3
"""
Fetch places from OpenStreetMap (Overpass API) for Givatayim
and insert into the places table.

Usage:
  python import_osm.py [--dry-run]

Loads credentials from the root .env.local (two dirs up).
"""

import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

# Load from root .env.local
load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")

# Givatayim bounding box (south, west, north, east — Overpass format)
BBOX = "32.063,34.808,32.082,34.848"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

OVERPASS_QUERY = f"""
[out:json][timeout:90];
(
  node["amenity"~"^(cafe|restaurant|fast_food|food_court|ice_cream|bar|pub|doctors|clinic|pharmacy|dentist|physiotherapist|hospital|gym|spa)$"]({BBOX});
  way["amenity"~"^(cafe|restaurant|fast_food|food_court|ice_cream|bar|pub|doctors|clinic|pharmacy|dentist|physiotherapist|hospital|gym|spa)$"]({BBOX});
  node["leisure"~"^(fitness_centre|sports_centre|swimming_pool)$"]({BBOX});
  way["leisure"~"^(fitness_centre|sports_centre|swimming_pool)$"]({BBOX});
  node["shop"~"^(beauty|hairdresser|massage|cosmetics|bakery|pastry)$"]({BBOX});
  way["shop"~"^(beauty|hairdresser|massage|cosmetics|bakery|pastry)$"]({BBOX});
  node["tourism"~"^(attraction|museum|gallery|artwork)$"]({BBOX});
  way["tourism"~"^(attraction|museum|gallery|artwork)$"]({BBOX});
  node["healthcare"]({BBOX});
  way["healthcare"]({BBOX});
);
out center body;
""".strip()

AMENITY_CATEGORY: dict[str, str] = {
    "cafe": "cafe", "coffee_shop": "cafe",
    "restaurant": "food", "fast_food": "food", "food_court": "food",
    "ice_cream": "food", "bar": "food", "pub": "food",
    "bakery": "food", "pastry": "food",
    "doctors": "doctor", "clinic": "doctor", "pharmacy": "doctor",
    "dentist": "doctor", "physiotherapist": "doctor", "hospital": "doctor",
    "gym": "wellness", "spa": "wellness",
}

LEISURE_CATEGORY: dict[str, str] = {
    "fitness_centre": "wellness",
    "sports_centre": "wellness",
    "swimming_pool": "wellness",
}

SHOP_CATEGORY: dict[str, str] = {
    "beauty": "wellness", "hairdresser": "wellness",
    "massage": "wellness", "cosmetics": "wellness",
}

TOURISM_CATEGORY: dict[str, str] = {
    "attraction": "attraction", "museum": "attraction",
    "gallery": "attraction", "artwork": "attraction",
}


def map_category(tags: dict) -> str | None:
    for key, mapping in [
        (tags.get("amenity", ""), AMENITY_CATEGORY),
        (tags.get("leisure", ""), LEISURE_CATEGORY),
        (tags.get("shop", ""), SHOP_CATEGORY),
        (tags.get("tourism", ""), TOURISM_CATEGORY),
    ]:
        if key in mapping:
            return mapping[key]
    if tags.get("healthcare"):
        return "doctor"
    return None


def map_kosher(tags: dict) -> str | None:
    val = tags.get("diet:kosher") or tags.get("kosher") or ""
    if val in ("yes", "only", "certified"):
        return "CERTIFIED"
    if val in ("no", "none"):
        return "NOT_CERTIFIED"
    return None


def get_coords(el: dict) -> tuple[float, float] | None:
    if el["type"] == "way":
        center = el.get("center", {})
        lat, lon = center.get("lat"), center.get("lon")
    else:
        lat, lon = el.get("lat"), el.get("lon")
    if lat is None or lon is None:
        return None
    return float(lat), float(lon)


def element_to_row(el: dict) -> dict | None:
    tags = el.get("tags", {})
    name = tags.get("name:he") or tags.get("name") or tags.get("name:en")
    if not name:
        return None

    category = map_category(tags)
    if not category:
        return None

    coords = get_coords(el)
    if not coords:
        return None
    lat, lon = coords

    phone_raw = tags.get("phone") or tags.get("contact:phone")
    phone = [phone_raw] if phone_raw else None

    website = tags.get("website") or tags.get("contact:website") or tags.get("url")
    hours = tags.get("opening_hours")

    parts = []
    if tags.get("addr:street"):
        street = tags["addr:street"]
        if tags.get("addr:housenumber"):
            street = f"{tags['addr:housenumber']} {street}"
        parts.append(street)
    if tags.get("addr:city"):
        parts.append(tags["addr:city"])
    address = ", ".join(parts) if parts else None

    return {
        "name": name,
        "place_category": category,
        "lat": lat,
        "lon": lon,
        "address": address,
        "phone": phone,
        "website": website,
        "hours": hours,
        "kosher": map_kosher(tags),
        "osm_id": el["id"],
    }


def fetch_existing_osm_ids(supabase) -> set[int]:
    result = supabase.table("places").select("attributes").eq("source", "osm").execute()
    ids: set[int] = set()
    for row in result.data or []:
        attrs = row.get("attributes") or {}
        osm_id = attrs.get("osm_id")
        if osm_id is not None:
            ids.add(int(osm_id))
    return ids


def insert_row(supabase, row: dict) -> str | None:
    resp = supabase.rpc("insert_community_place", {
        "p_name": row["name"],
        "p_category": row["place_category"],
        "p_lon": row["lon"],
        "p_lat": row["lat"],
        "p_address": row.get("address"),
        "p_description": None,
        "p_phone": row.get("phone"),
        "p_website": row.get("website"),
        "p_hours": row.get("hours"),
        "p_user_id": None,
    }).execute()
    place_id = resp.data
    if not place_id:
        return None

    updates: dict = {
        "source": "osm",
        "is_verified": False,
        "attributes": {"osm_id": row["osm_id"]},
    }
    if row.get("kosher"):
        updates["kosher"] = row["kosher"]

    supabase.table("places").update(updates).eq("id", place_id).execute()
    return place_id


def main():
    dry_run = "--dry-run" in sys.argv

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    print("Fetching from Overpass API...")
    elements = None
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(2):
            try:
                resp = requests.post(
                    endpoint,
                    data={"data": OVERPASS_QUERY},
                    timeout=120,
                )
                resp.raise_for_status()
                elements = resp.json()["elements"]
                print(f"  (via {endpoint})")
                break
            except Exception as e:
                if attempt == 0:
                    print(f"  {endpoint} attempt 1 failed, retrying in 5s...")
                    time.sleep(5)
                else:
                    print(f"  {endpoint} failed: {e}, trying next...")
        if elements is not None:
            break
    if elements is None:
        print("ERROR: all Overpass endpoints failed")
        return 1
    print(f"  {len(elements)} OSM elements returned")

    rows = [r for el in elements if (r := element_to_row(el))]
    print(f"  {len(rows)} mappable places")

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    existing_ids = fetch_existing_osm_ids(supabase)
    print(f"  {len(existing_ids)} already in DB, skipping duplicates")

    new_rows = [r for r in rows if r["osm_id"] not in existing_ids]
    print(f"  {len(new_rows)} to insert")

    if dry_run:
        for r in new_rows:
            print(f"  [DRY RUN] {r['place_category']:12} | {r['name']}")
        return 0

    inserted = 0
    errors = 0
    for r in new_rows:
        try:
            place_id = insert_row(supabase, r)
            if place_id:
                print(f"  + {r['place_category']:12} | {r['name']}")
                inserted += 1
            else:
                print(f"  ? {r['name']} — no ID returned", file=sys.stderr)
                errors += 1
        except Exception as e:
            print(f"  ERROR {r['name']}: {e}", file=sys.stderr)
            errors += 1
        time.sleep(0.05)  # gentle rate limit

    print(f"\nDone: {inserted} inserted, {errors} errors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
