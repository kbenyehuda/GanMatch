#!/usr/bin/env python3
"""
Dry-run re-geocoding for ganim.

- Reads credentials from repo root `.env.local`
- Fetches ganim (id, name, address, city, lat/lon) via Supabase RPC `get_all_ganim`
- For rows with an address, forward-geocodes using Mapbox
- Outputs a CSV showing how much each gan moved (meters) + new lat/lon

IMPORTANT: This script does NOT write anything back to Supabase.
"""

from __future__ import annotations

import csv
import math
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import requests
from dotenv import load_dotenv
from supabase import create_client


@dataclass(frozen=True)
class GeocodeResult:
    lat: float
    lon: float
    place_name: str

REPORT_COLUMNS: list[str] = [
    "id",
    "name_he",
    "city",
    "address",
    "old_lat",
    "old_lon",
    "new_lat",
    "new_lon",
    "moved_m",
    "place_name",
    "query",
    "status",
]


CITY_CENTERS: dict[str, tuple[float, float]] = {
    "גבעתיים": (32.0702, 34.8117),
    "תל אביב": (32.0853, 34.7818),
    "תל אביב-יפו": (32.0853, 34.7818),
    "רמת גן": (32.0823, 34.8107),
}


def repo_root() -> Path:
    # scripts/maintenance/<this_file.py> -> repo root is two levels up
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    root = repo_root()
    load_dotenv(root / ".env.local")


def env_trim(name: str) -> str | None:
    v = os.getenv(name)
    if not v:
        return None
    t = v.strip()
    return t or None


def require_env_any(names: list[str]) -> str:
    for n in names:
        v = env_trim(n)
        if v:
            return v
    raise RuntimeError(f"Missing required environment variable (any of): {', '.join(names)}")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def build_query(address: str, city: str | None) -> str:
    addr = (address or "").strip()
    c = (city or "").strip()
    if not c:
        return addr
    if c in addr:
        return addr
    return f"{addr}, {c}"


def mapbox_geocode(query: str, token: str, *, proximity: tuple[float, float] | None) -> GeocodeResult | None:
    # Mapbox expects proximity as "lon,lat"
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(query)}.json"
    params: dict[str, str] = {
        "access_token": token,
        "country": "il",
        "language": "he",
        "limit": "1",
        "types": "address,poi",
    }
    if proximity:
        lat, lon = proximity[0], proximity[1]
        params["proximity"] = f"{lon},{lat}"
    resp = requests.get(url, params=params, timeout=25)
    if resp.status_code >= 400:
        return None
    data = resp.json()
    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or len(features) == 0:
        return None
    f = features[0] if isinstance(features[0], dict) else None
    if not f:
        return None
    center = f.get("center")
    if not (isinstance(center, list) and len(center) >= 2):
        return None
    lon = float(center[0])
    lat = float(center[1])
    place_name = str(f.get("place_name") or "")
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return None
    return GeocodeResult(lat=lat, lon=lon, place_name=place_name)


def try_write_xlsx(path: Path, rows: Iterable[dict[str, Any]]) -> bool:
    try:
        from openpyxl import Workbook
    except Exception:
        return False

    wb = Workbook()
    ws = wb.active
    ws.title = "regeocode"

    ws.append(REPORT_COLUMNS)
    for r in rows:
        ws.append([r.get(k, "") for k in REPORT_COLUMNS])

    wb.save(path)
    return True


def main() -> int:
    load_env()

    supabase_url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
    supabase_key = require_env_any(
        [
            # prefer service role if present, but allow anon for read-only dry-run
            "SUPABASE_SERVICE_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_SERVICE_ROLE",
            "SUPABASE_SERVICE_ROLE_SECRET",
            "SUPABASE_ANON_KEY",
            "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ]
    )
    mapbox_token = require_env_any(["MAPBOX_ACCESS_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"])

    sb = create_client(supabase_url, supabase_key)

    limit = 10000
    try:
        res = sb.rpc("get_all_ganim", {"p_limit": limit}).execute()
        rows = res.data if hasattr(res, "data") else None
    except Exception as e:
        print(f"Error calling get_all_ganim RPC: {e}")
        return 1

    if not isinstance(rows, list):
        print("Unexpected response: get_all_ganim did not return a list.")
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = repo_root() / "scripts" / "maintenance" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv_path = out_dir / f"regeocode_dryrun_{ts}.csv"
    out_xlsx_path = out_dir / f"regeocode_dryrun_{ts}.xlsx"

    total = len(rows)
    skipped_no_address = 0
    geocoded = 0
    no_result = 0

    report_rows: list[dict[str, Any]] = []

    with open(out_csv_path, "w", encoding="utf-8-sig", newline="") as f:
        # utf-8-sig adds a BOM so Windows Excel opens Hebrew correctly.
        w = csv.DictWriter(f, fieldnames=REPORT_COLUMNS)
        w.writeheader()

        for i, row in enumerate(rows):
            if not isinstance(row, dict):
                continue

            gan_id = str(row.get("id") or "")
            name_he = str(row.get("name_he") or "")
            address = row.get("address")
            city = row.get("city")

            address_s = str(address).strip() if isinstance(address, str) else ""
            city_s = str(city).strip() if isinstance(city, str) else ""

            old_lat = row.get("lat")
            old_lon = row.get("lon")
            try:
                old_lat_f = float(old_lat)
                old_lon_f = float(old_lon)
            except Exception:
                old_lat_f = float("nan")
                old_lon_f = float("nan")

            if not address_s:
                skipped_no_address += 1
                continue

            query = build_query(address_s, city_s or None)
            proximity = None
            if math.isfinite(old_lat_f) and math.isfinite(old_lon_f):
                proximity = (old_lat_f, old_lon_f)
            elif city_s in CITY_CENTERS:
                proximity = CITY_CENTERS[city_s]

            geo = mapbox_geocode(query, mapbox_token, proximity=proximity)
            if not geo:
                no_result += 1
                out_row = {
                    "id": gan_id,
                    "name_he": name_he,
                    "city": city_s or "",
                    "address": address_s,
                    "old_lat": old_lat_f if math.isfinite(old_lat_f) else "",
                    "old_lon": old_lon_f if math.isfinite(old_lon_f) else "",
                    "new_lat": "",
                    "new_lon": "",
                    "moved_m": "",
                    "place_name": "",
                    "query": query,
                    "status": "no_result",
                }
                report_rows.append(out_row)
                w.writerow(out_row)
            else:
                geocoded += 1
                moved = (
                    haversine_m(old_lat_f, old_lon_f, geo.lat, geo.lon)
                    if (math.isfinite(old_lat_f) and math.isfinite(old_lon_f))
                    else ""
                )
                out_row = {
                    "id": gan_id,
                    "name_he": name_he,
                    "city": city_s or "",
                    "address": address_s,
                    "old_lat": old_lat_f if math.isfinite(old_lat_f) else "",
                    "old_lon": old_lon_f if math.isfinite(old_lon_f) else "",
                    "new_lat": geo.lat,
                    "new_lon": geo.lon,
                    "moved_m": moved,
                    "place_name": geo.place_name,
                    "query": query,
                    "status": "ok",
                }
                report_rows.append(out_row)
                w.writerow(out_row)

            # Light rate limit so we don't blast the API
            time.sleep(0.12)

            if (i + 1) % 50 == 0:
                print(f"[{i+1}/{total}] processed... (geocoded: {geocoded}, no_result: {no_result}, skipped(no address): {skipped_no_address})")

    wrote_xlsx = try_write_xlsx(out_xlsx_path, report_rows)

    print("\n=== Dry-run complete (NO DB WRITES) ===")
    print(f"Total rows fetched: {total}")
    print(f"Skipped (no address): {skipped_no_address}")
    print(f"Geocoded: {geocoded}")
    print(f"No result: {no_result}")
    print(f"Output CSV (Excel-friendly UTF-8): {out_csv_path}")
    if wrote_xlsx:
        print(f"Output Excel: {out_xlsx_path}")
    else:
        print("Excel output not written (missing dependency). Install `openpyxl` and rerun.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        raise SystemExit(130)

