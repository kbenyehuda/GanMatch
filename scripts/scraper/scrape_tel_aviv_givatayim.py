#!/usr/bin/env python3
"""
Scrape daycare (ganim) data for Tel Aviv and Givatayim.
Use SKIP_LLM=1 to disable OpenAI and use rule-based extraction only (no API cost).
Uses Playwright to fetch pages, Nominatim to geocode, Supabase to store.

Prerequisites:
  pip install -r requirements.txt
  playwright install chromium

Environment:
  SUPABASE_URL, SUPABASE_SERVICE_KEY - required
  No geocoding API key - uses map links from page + Nominatim (free)

Run:
  python scrape_tel_aviv_givatayim.py
"""

import os
import time
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from supabase import create_client

from config import SOURCES
from geocode import geocode_with_retry, get_city_center
from extract_ganim import extract_ganim_from_html
from extract_llm import extract_ganim_with_llm

load_dotenv()
load_dotenv(Path(__file__).parent / ".env")
try:
    load_dotenv(Path(__file__).parent.parent.parent / ".env.local")
except Exception:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
)

_last_html = ""


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_*)")
        print("  Options: .env file in scripts/scraper/ or system environment variables")
        print("  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL")
        print("  SUPABASE_SERVICE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY")
        return 1

    use_llm = (
        (os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY") or "").strip()
        and os.getenv("SKIP_LLM", "").lower() not in ("1", "true", "yes")
    )
    print("=== GanMatch Scraper ===", flush=True)
    print(f"Extraction: {'LLM (OpenAI)' if use_llm else 'Rule-based only'} (set SKIP_LLM=1 to disable LLM)", flush=True)
    print(f"Sources: {', '.join(SOURCES.keys())}", flush=True)
    print(flush=True)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    all_ganim = []

    with sync_playwright() as p:
        print("[1/3] Launching browser...")
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_extra_http_headers({"Accept-Language": "he,en;q=0.9"})

        for source_id, cfg in SOURCES.items():
            urls = [cfg["url"]] + cfg.get("alt_urls", [])
            print(f"\n--- {source_id.upper()} ---")
            for url in urls:
                try:
                    print(f"  Fetching {url} ...", flush=True)
                    # Use "load" not "networkidle" - municipal sites often never go idle (analytics, chat, etc.)
                    page.goto(url, wait_until="load", timeout=30000)
                    print("  Page loaded, waiting 4s for dynamic table...", flush=True)
                    for s in range(4, 0, -1):
                        print(f"  ... {s}s", flush=True)
                        time.sleep(1)

                    # Click expand buttons to reveal map links in collapsed rows
                    print("  Looking for expand buttons...", flush=True)
                    try:
                        page.set_default_timeout(5000)
                        try:
                            expand_btns = page.locator('a[title*="פתיחת מידע"]').all()[:60]
                            print(f"  Found {len(expand_btns)} expand buttons, clicking...", flush=True)
                            clicked = 0
                            for i, el in enumerate(expand_btns):
                                try:
                                    el.click(timeout=2000)
                                    time.sleep(0.15)
                                    clicked += 1
                                    if (i + 1) % 15 == 0:
                                        print(f"    expanded {i+1}/{len(expand_btns)}...", flush=True)
                                except Exception:
                                    pass
                            if clicked:
                                print(f"  Expanded {clicked} rows", flush=True)
                        finally:
                            page.set_default_timeout(30000)
                    except Exception as e:
                        print(f"  Expand step skipped: {e}", flush=True)
                    time.sleep(0.5)
                    html = page.content()
                    globals()["_last_html"] = html
                    city_he, city_en = cfg["city"], cfg.get("city_en", "")
                    ganim = []

                    if use_llm:
                        print("  Calling OpenAI for extraction...", flush=True)
                        ganim = extract_ganim_with_llm(html, city_he, city_en)
                        if ganim:
                            print(f"  LLM returned {len(ganim)} entries")
                    if not ganim:
                        print("  Using rule-based extraction...")
                        ganim = extract_ganim_from_html(html, city_he, city_en)

                    for g in ganim:
                        g["_source"] = source_id
                    all_ganim.extend(ganim)
                    if ganim:
                        from_page = sum(1 for g in ganim if g.get("_coords"))
                        print(f"  ✓ Found {len(ganim)} ganim ({from_page} with coords from page)", flush=True)
                        for j, g in enumerate(ganim):
                            coords_str = f"@{g['_coords'][0]:.4f},{g['_coords'][1]:.4f}" if g.get("_coords") else "(geocoding)"
                            phone = (g.get("metadata") or {}).get("phone", [])
                            phone_str = phone[0] if phone else ""
                            print(f"    [{j+1}] {g['name_he']}", flush=True)
                            print(f"         address: {g.get('address') or '-'} | phone: {phone_str or '-'} | {coords_str}", flush=True)
                        break
                except Exception as e:
                    print(f"  Error: {e}")
                time.sleep(1)

        browser.close()

    if not all_ganim:
        print("\nNo ganim extracted. Saving HTML for inspection...")
        debug_dir = Path(__file__).parent / "debug"
        debug_dir.mkdir(parents=True, exist_ok=True)
        last_html = globals().get("_last_html", "")
        if last_html:
            (debug_dir / "last_page.html").write_text(last_html, encoding="utf-8")
        print("  Saved to scripts/scraper/debug/last_page.html")
        print("\nYou can:")
        print("  1. Manually add data via scripts/scraper/import_from_csv.py")
        print("  2. Inspect the HTML and update selectors in this script")
        return 1

    # Geocode and upsert
    print("\n--- GEOCODING & UPLOAD ---")
    if os.getenv("SKIP_GEOCODE", "").lower() in ("1", "true", "yes"):
        print(f"Upserting {len(all_ganim)} ganim (SKIP_GEOCODE: using city centers)")
    else:
        print(f"Geocoding and upserting {len(all_ganim)} ganim to Supabase...")
    total = len(all_ganim)
    inserted = 0
    from_links = 0
    from_geocode = 0
    from_fallback = 0
    for i, g in enumerate(all_ganim):
        map_coords = g.pop("_coords", None)
        addr = g.get("address") or g.get("name_he")
        city = g.get("city")
        coords = None

        # Prefer explicit coordinates embedded in the municipal page (usually most accurate),
        # then geocode known addresses, then fall back to city center.
        if map_coords:
            coords = map_coords
            from_links += 1
        if not coords and addr and len(str(addr).strip()) >= 3:
            coords = geocode_with_retry(addr, city)
            if coords:
                from_geocode += 1
        if not coords:
            coords = get_city_center(city)
            from_fallback += 1
            if not os.getenv("SKIP_GEOCODE") and from_fallback <= 3:
                print(f"  [{i+1}/{total}] No coords for {g['name_he'][:30]}... using city center")

        lon, lat = coords[1], coords[0]
        metadata = g.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}

        row = {
            "name_he": g["name_he"],
            "name_en": g.get("name_en"),
            "address": g.get("address"),
            "city": g.get("city"),
            "type": g.get("type", "Supervised"),
            "license_status": g.get("license_status", "Permanent"),
            "has_cctv": g.get("has_cctv", False),
            "metadata": metadata,
            "location": f"SRID=4326;POINT({lon} {lat})",
        }

        try:
            supabase.rpc(
                "insert_gan",
                {
                    "p_name_he": row["name_he"],
                    "p_name_en": row["name_en"],
                    "p_address": row["address"],
                    "p_city": row["city"],
                    "p_type": row["type"],
                    "p_license_status": row["license_status"],
                    "p_has_cctv": row["has_cctv"],
                    "p_metadata": row["metadata"],
                    "p_lon": lon,
                    "p_lat": lat,
                },
            ).execute()
            inserted += 1
            phone = (metadata.get("phone") or []) if isinstance(metadata, dict) else []
            phone_str = phone[0] if phone else "-"
            print(f"  [{i+1}/{total}] {g['name_he']}", flush=True)
            print(f"       → {g.get('address') or '-'} | {phone_str} | ({lat:.4f}, {lon:.4f})", flush=True)
        except Exception as e:
            err_str = str(e)
            if "PGRST202" in err_str or "insert_gan" in err_str:
                if inserted == 0 and i == 0:
                    print("\n*** INSERT_GAN RPC NOT FOUND ***")
                    print("Run this migration in Supabase SQL Editor:")
                    print("  supabase/migrations/20260227200000_insert_gan_rpc.sql")
                    print("Then reload the schema: Supabase Dashboard -> Settings -> API -> Reload schema")
                    print()
            print(f"  Insert error for {g['name_he'][:30]}: {e}")

    print(f"\nDone. Inserted {inserted} ganim.")
    if from_links or from_geocode:
        print(f"  Coords: {from_links} from map links, {from_geocode} from geocoding, {from_fallback} fallback")
    return 0


if __name__ == "__main__":
    exit(main())
