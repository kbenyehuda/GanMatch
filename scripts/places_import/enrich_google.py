#!/usr/bin/env python3
"""
Enrich and discover places using Google Places API (New).

Modes (default: both):
  --enrich    Fill missing phone/website/hours for existing OSM places
  --discover  Find new places in Givatayim not yet in the DB

Flags:
  --dry-run   Preview without writing to DB or spending API credits
  --limit N   Process at most N candidates (enrich mode only)
  --force     Re-run even if sentinel file says already complete

COST NOTICE: Each run of --enrich costs ~$2.50; --discover costs ~$0.50.
Both are within Google's $200/month free credit.
A sentinel file (.enrich_complete / .discovery_complete) is written after
each successful run. Re-running without --force is blocked.

Credentials loaded from root .env.local.
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
GOOGLE_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

NEARBYSEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
TEXTSEARCH_URL = "https://places.googleapis.com/v1/places:searchText"

ENRICH_FIELD_MASK = (
    "places.id,places.internationalPhoneNumber,"
    "places.websiteUri,places.regularOpeningHours"
)
DISCOVER_FIELD_MASK = (
    "places.id,places.displayName,places.internationalPhoneNumber,"
    "places.websiteUri,places.regularOpeningHours,"
    "places.location,places.formattedAddress"
)

GIVATAYIM_CENTER = {"latitude": 32.0702, "longitude": 34.8117}
GIVATAYIM_RADIUS = 2000.0  # meters — covers all of Givatayim

# Each tuple: (google_place_types, our place_category)
DISCOVERY_QUERIES = [
    (["cafe", "coffee_shop"],                       "cafe"),
    (["bakery"],                                    "food"),
    (["restaurant", "fast_food_restaurant"],        "food"),
    (["doctor", "dentist", "physiotherapist"],      "doctor"),
    (["pharmacy", "hospital"],                      "doctor"),
    (["gym", "spa"],                                "wellness"),
    (["beauty_salon", "hair_salon", "nail_salon"],  "wellness"),
    (["tourist_attraction", "museum", "art_gallery"], "attraction"),
]

ENRICH_SENTINEL = Path(__file__).parent / ".enrich_complete"
DISCOVER_SENTINEL = Path(__file__).parent / ".discovery_complete"


# ---------------------------------------------------------------------------
# Google API helpers
# ---------------------------------------------------------------------------

def _google_post(url: str, field_mask: str, body: dict) -> dict:
    resp = requests.post(
        url,
        headers={
            "X-Goog-Api-Key": GOOGLE_KEY,
            "X-Goog-FieldMask": field_mask,
            "Content-Type": "application/json",
        },
        json=body,
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


def search_by_name(name: str, lat: float, lon: float) -> dict | None:
    """Text Search by name near a point. Returns first Google Place result or None."""
    data = _google_post(TEXTSEARCH_URL, ENRICH_FIELD_MASK, {
        "textQuery": f"{name} גבעתיים",
        "languageCode": "iw",
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": 5000.0,
            }
        },
    })
    places = data.get("places", [])
    return places[0] if places else None


def search_nearby(types: list[str], category: str) -> list[dict]:
    """Nearby Search by place type within Givatayim. Returns list of Google Places."""
    data = _google_post(NEARBYSEARCH_URL, DISCOVER_FIELD_MASK, {
        "includedTypes": types,
        "maxResultCount": 20,
        "languageCode": "iw",
        "locationRestriction": {
            "circle": {
                "center": GIVATAYIM_CENTER,
                "radius": GIVATAYIM_RADIUS,
            }
        },
    })
    return data.get("places", [])


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def fetch_osm_places(supabase) -> list[dict]:
    """All OSM-sourced places with lat/lon from the bbox RPC."""
    result = supabase.rpc("get_places_in_bbox", {
        "min_lon": 34.80, "min_lat": 32.06,
        "max_lon": 34.85, "max_lat": 32.09,
        "p_limit": 500,
    }).execute()
    return [r for r in (result.data or []) if r.get("source") == "osm"]


def fetch_existing_google_ids(supabase) -> set[str]:
    """Collect all google_place_ids already stored in attributes."""
    result = supabase.table("places").select("attributes").execute()
    ids: set[str] = set()
    for row in result.data or []:
        gid = (row.get("attributes") or {}).get("google_place_id")
        if gid:
            ids.add(gid)
    return ids


def fetch_existing_names(supabase) -> set[str]:
    """Lowercase set of all place names for fuzzy dedup."""
    result = supabase.table("places").select("name").execute()
    return {(r.get("name") or "").strip().lower() for r in result.data or []}


def build_enrich_update(gplace: dict, existing: dict) -> dict:
    """Only fill in fields that are missing. Merge google_place_id into attributes."""
    updates: dict = {}

    if not existing.get("phone") and gplace.get("internationalPhoneNumber"):
        updates["phone"] = [gplace["internationalPhoneNumber"]]

    if not existing.get("website") and gplace.get("websiteUri"):
        updates["website"] = gplace["websiteUri"]

    if not existing.get("hours"):
        descs = gplace.get("regularOpeningHours", {}).get("weekdayDescriptions", [])
        if descs:
            updates["hours"] = " | ".join(descs)

    # Always store google_place_id so we can dedup on future discovery runs
    existing_attrs = existing.get("attributes") or {}
    if "google_place_id" not in existing_attrs:
        updates["attributes"] = {**existing_attrs, "google_place_id": gplace["id"]}

    return updates


def insert_discovered_place(supabase, gplace: dict, category: str) -> str | None:
    loc = gplace.get("location", {})
    lat = loc.get("latitude")
    lon = loc.get("longitude")
    name = (gplace.get("displayName") or {}).get("text")
    if not name or not lat or not lon:
        return None

    phone_raw = gplace.get("internationalPhoneNumber")
    descs = gplace.get("regularOpeningHours", {}).get("weekdayDescriptions", [])

    resp = supabase.rpc("insert_community_place", {
        "p_name": name,
        "p_category": category,
        "p_lon": lon,
        "p_lat": lat,
        "p_address": gplace.get("formattedAddress"),
        "p_description": None,
        "p_phone": [phone_raw] if phone_raw else None,
        "p_website": gplace.get("websiteUri"),
        "p_hours": " | ".join(descs) if descs else None,
        "p_user_id": None,
    }).execute()
    place_id = resp.data
    if not place_id:
        return None

    supabase.table("places").update({
        "source": "google",
        "is_verified": False,
        "attributes": {"google_place_id": gplace["id"]},
    }).eq("id", place_id).execute()
    return place_id


# ---------------------------------------------------------------------------
# Sentinel helpers
# ---------------------------------------------------------------------------

def check_sentinel(path: Path, mode: str, force: bool) -> bool:
    """Return True if OK to proceed, False if blocked."""
    if path.exists() and not force:
        ran_at = path.read_text().strip()
        print(f"ERROR: {mode} already ran on {ran_at}.")
        print(f"  Use --force to re-run (costs money). Skipping.")
        return False
    return True


def write_sentinel(path: Path):
    path.write_text(datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    force = "--force" in args
    do_enrich = "--enrich" in args or "--discover" not in args
    do_discover = "--discover" in args or "--enrich" not in args

    limit = None
    if "--limit" in args:
        idx = args.index("--limit")
        limit = int(args[idx + 1])

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1
    if not GOOGLE_KEY:
        print("ERROR: GOOGLE_PLACES_API_KEY not found. Add it to .env.local or set it in your shell.")
        return 1

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # -----------------------------------------------------------------------
    # ENRICH: fill missing data on existing OSM places
    # -----------------------------------------------------------------------
    if do_enrich:
        if not check_sentinel(ENRICH_SENTINEL, "Enrichment", force):
            do_enrich = False

    if do_enrich:
        print("\n=== ENRICH: filling missing data on OSM places ===")
        osm_places = fetch_osm_places(supabase)
        candidates = [
            p for p in osm_places
            if not p.get("phone") or not p.get("website") or not p.get("hours")
            or not (p.get("attributes") or {}).get("google_place_id")
        ]
        if limit:
            candidates = candidates[:limit]
        print(f"{len(candidates)} OSM places need enrichment")

        enriched = skipped = errors = 0
        for place in candidates:
            name = place["name"]
            lat, lon = place["lat"], place["lon"]
            try:
                gplace = search_by_name(name, lat, lon)
                if not gplace:
                    skipped += 1
                    continue
                updates = build_enrich_update(gplace, place)
                if not updates:
                    skipped += 1
                    continue
                if dry_run:
                    print(f"  [DRY RUN] {name}: {list(updates.keys())}")
                else:
                    supabase.table("places").update(updates).eq("id", place["id"]).execute()
                    print(f"  ✓ {name}: {list(updates.keys())}")
                enriched += 1
                time.sleep(0.2)
            except Exception as e:
                print(f"  ERROR {name}: {e}", file=sys.stderr)
                errors += 1
                time.sleep(1)

        print(f"Enrich done: {enriched} updated, {skipped} skipped, {errors} errors")
        if not dry_run and errors == 0:
            write_sentinel(ENRICH_SENTINEL)
            print(f"  Sentinel written: {ENRICH_SENTINEL}")

    # -----------------------------------------------------------------------
    # DISCOVER: find new places not already in the DB
    # -----------------------------------------------------------------------
    if do_discover:
        if not check_sentinel(DISCOVER_SENTINEL, "Discovery", force):
            do_discover = False

    if do_discover:
        print("\n=== DISCOVER: finding new places from Google ===")
        existing_google_ids = fetch_existing_google_ids(supabase)
        existing_names = fetch_existing_names(supabase)
        print(f"  {len(existing_google_ids)} places already have a google_place_id")
        print(f"  {len(existing_names)} existing place names for dedup")

        created = skipped = errors = 0
        for types, category in DISCOVERY_QUERIES:
            print(f"\n  Searching {types} -> {category}...")
            try:
                places = search_nearby(types, category)
                print(f"    {len(places)} results from Google")
                for gplace in places:
                    gid = gplace.get("id", "")
                    gname = (gplace.get("displayName") or {}).get("text", "")

                    if gid in existing_google_ids:
                        skipped += 1
                        continue
                    if gname.strip().lower() in existing_names:
                        skipped += 1
                        continue

                    if dry_run:
                        print(f"    [DRY RUN] + {category:12} | {gname}")
                        created += 1
                        existing_names.add(gname.strip().lower())
                    else:
                        try:
                            place_id = insert_discovered_place(supabase, gplace, category)
                            if place_id:
                                print(f"    + {category:12} | {gname}")
                                existing_google_ids.add(gid)
                                existing_names.add(gname.strip().lower())
                                created += 1
                            else:
                                skipped += 1
                        except Exception as e:
                            print(f"    ERROR {gname}: {e}", file=sys.stderr)
                            errors += 1
                    time.sleep(0.1)
                time.sleep(0.3)
            except Exception as e:
                print(f"  ERROR querying {types}: {e}", file=sys.stderr)
                errors += 1

        print(f"\nDiscover done: {created} created, {skipped} skipped (already in DB), {errors} errors")
        if not dry_run and errors == 0:
            write_sentinel(DISCOVER_SENTINEL)
            print(f"  Sentinel written: {DISCOVER_SENTINEL}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
