#!/usr/bin/env python3
"""
Import ganim from a CSV file when scraping doesn't find structure.
CSV columns: name_he, name_en, address, city, type, license_status, has_cctv, phone

Example CSV (ganim_import.csv):
name_he,name_en,address,city,type,license_status,has_cctv,phone
גן שמש,Gan Shemesh,רחוב ויצמן 10,גבעתיים,Supervised,Permanent,false,03-1234567

Run:
  python import_from_csv.py ganim_import.csv
"""

import csv
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from geocode import geocode_with_retry

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")


def main():
    if len(sys.argv) < 2:
        print("Usage: python import_from_csv.py <filename.csv>")
        print("CSV columns: name_he, name_en, address, city, type, license_status, has_cctv, phone")
        return 1

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return 1

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"File not found: {path}")
        return 1

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    inserted = 0

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            name_he = (row.get("name_he") or "").strip()
            if not name_he:
                continue
            address = (row.get("address") or "").strip()
            city = (row.get("city") or "תל אביב").strip()
            coords = geocode_with_retry(address or name_he, city)
            if not coords:
                centers = {"תל אביב": (32.0853, 34.7818), "גבעתיים": (32.0702, 34.8117)}
                coords = centers.get(city, (32.08, 34.78))
            lat, lon = coords[0], coords[1]
            phone = (row.get("phone") or "").strip()
            metadata = {"phone": [phone]} if phone else {}

            try:
                supabase.rpc(
                    "insert_gan",
                    {
                        "p_name_he": name_he,
                        "p_name_en": (row.get("name_en") or "").strip() or None,
                        "p_address": address or None,
                        "p_city": city,
                        "p_type": row.get("type", "Supervised"),
                        "p_license_status": row.get("license_status", "Permanent"),
                        "p_has_cctv": (row.get("has_cctv") or "").lower() in ("true", "1", "yes"),
                        "p_metadata": metadata,
                        "p_lon": lon,
                        "p_lat": lat,
                    },
                ).execute()
                inserted += 1
                print(f"  [{i+1}] {name_he[:40]} ...")
            except Exception as e:
                print(f"  Error: {e}")

    print(f"\nImported {inserted} ganim.")
    return 0


if __name__ == "__main__":
    exit(main())
