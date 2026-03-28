#!/usr/bin/env python3
"""
Find ganim that share the exact same coordinates (stacked) and re-geocode them.

Phase 1 (always): fetch all ganim, group by exact (lat, lon), report which cities
  have clusters of >=N ganim at the same point.

Stacks where many ganim share the same *text address* (e.g. one campus) are skipped
  by default (--same-address-protect-min, default 8) so we do not re-geocode them.
  Ramat-Gan-style piles (same coords, different street addresses) are still fixed.

Phase 2 (--apply): for each stacked gan that has an address, geocode via Mapbox
  and update ganim_v2.location in Supabase. Writes a backup CSV first.

Without --apply this is a dry run: prints the report and writes a CSV with proposed
new coordinates, but makes no DB changes.

Usage:
  python regeocode_stacked_ganim.py                  # dry run, min-stack=3
  python regeocode_stacked_ganim.py --min-stack 5    # only stacks of 5+
  python regeocode_stacked_ganim.py --apply          # write to DB
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import create_client


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CITY_CENTERS: dict[str, tuple[float, float]] = {
    "גבעתיים": (32.0702, 34.8117),
    "תל אביב": (32.0853, 34.7818),
    "תל אביב-יפו": (32.0853, 34.7818),
    "רמת גן": (32.0823, 34.8107),
}

REPORT_COLUMNS = [
    "id",
    "name_he",
    "city",
    "address",
    "old_lat",
    "old_lon",
    "stack_size",
    "new_lat",
    "new_lon",
    "moved_m",
    "place_name",
    "query",
    "status",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class GeocodeResult:
    lat: float
    lon: float
    place_name: str


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    load_dotenv(repo_root() / ".env.local")


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
    raise RuntimeError(f"Missing required env var (any of): {', '.join(names)}")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


_APPLY_COORD_DECIMALS = 7


def report_row_old_new_same_point(r: dict[str, Any]) -> bool:
    """Skip DB write when dry-run old_* already equals new_* on the row."""
    ola, olo = r.get("old_lat"), r.get("old_lon")
    try:
        nla = float(r["new_lat"])
        nlo = float(r["new_lon"])
    except (KeyError, TypeError, ValueError):
        return False
    try:
        ola_f = float(ola)
        olo_f = float(olo)
    except (TypeError, ValueError):
        return False
    if not (math.isfinite(ola_f) and math.isfinite(olo_f) and math.isfinite(nla) and math.isfinite(nlo)):
        return False
    return round(ola_f, _APPLY_COORD_DECIMALS) == round(nla, _APPLY_COORD_DECIMALS) and round(
        olo_f, _APPLY_COORD_DECIMALS
    ) == round(nlo, _APPLY_COORD_DECIMALS)


def build_query(address: str, city: str | None) -> str:
    addr = (address or "").strip()
    c = (city or "").strip()
    if not c or c in addr:
        return addr
    return f"{addr}, {c}"


def mapbox_geocode(query: str, token: str, *, proximity: tuple[float, float] | None) -> GeocodeResult | None:
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(query)}.json"
    params: dict[str, str] = {
        "access_token": token,
        "country": "il",
        "language": "he",
        "limit": "1",
        "types": "address,poi",
    }
    if proximity:
        lat, lon = proximity
        params["proximity"] = f"{lon},{lat}"
    try:
        resp = requests.get(url, params=params, timeout=25)
    except requests.RequestException:
        return None
    if resp.status_code >= 400:
        return None
    data = resp.json()
    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or not features:
        return None
    f = features[0]
    if not isinstance(f, dict):
        return None
    center = f.get("center")
    if not (isinstance(center, list) and len(center) >= 2):
        return None
    lon_r, lat_r = float(center[0]), float(center[1])
    if not (math.isfinite(lat_r) and math.isfinite(lon_r)):
        return None
    return GeocodeResult(lat=lat_r, lon=lon_r, place_name=str(f.get("place_name") or ""))


# ---------------------------------------------------------------------------
# Phase 1: find stacked groups
# ---------------------------------------------------------------------------

def find_stacked(rows: list[dict[str, Any]], min_stack: int) -> dict[tuple[float, float], list[dict[str, Any]]]:
    """Group ganim by exact (lat, lon); return only groups with >= min_stack members."""
    groups: dict[tuple[float, float], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if not isinstance(row, dict):
            continue
        try:
            lat = float(row["lat"])
            lon = float(row["lon"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (math.isfinite(lat) and math.isfinite(lon)):
            continue
        groups[(lat, lon)].append(row)
    return {k: v for k, v in groups.items() if len(v) >= min_stack}


def large_unanimous_same_address_stack(ganim: list[dict[str, Any]], min_size: int) -> bool:
    """
    True if this stack has at least min_size ganim, every row has a non-empty address,
    and all address strings match exactly (after strip). Typical: many ganim, one real building.
    """
    if len(ganim) < min_size:
        return False
    addrs = [str(g.get("address") or "").strip() for g in ganim]
    if not all(addrs):
        return False
    return len(set(addrs)) == 1


def partition_stacked_skip_same_address(
    stacked: dict[tuple[float, float], list[dict[str, Any]]],
    same_address_protect_min: int,
) -> tuple[dict[tuple[float, float], list[dict[str, Any]]], list[dict[str, Any]]]:
    """
    Remove stacks that look like one facility (many ganim, identical address text).
    Returns (stacks_to_geocode, skipped_report_rows for CSV).
    """
    if same_address_protect_min <= 0:
        return stacked, []

    to_fix: dict[tuple[float, float], list[dict[str, Any]]] = {}
    skipped_rows: list[dict[str, Any]] = []

    for coords, ganim in stacked.items():
        if large_unanimous_same_address_stack(ganim, same_address_protect_min):
            n = len(ganim)
            for g in ganim:
                gan_id = str(g.get("id") or "")
                name_he = str(g.get("name_he") or "")
                city_s = str(g.get("city") or "").strip()
                address_s = str(g.get("address") or "").strip()
                old_lat = float(g["lat"])
                old_lon = float(g["lon"])
                skipped_rows.append(
                    {
                        "id": gan_id,
                        "name_he": name_he,
                        "city": city_s,
                        "address": address_s,
                        "old_lat": old_lat,
                        "old_lon": old_lon,
                        "stack_size": n,
                        "new_lat": "",
                        "new_lon": "",
                        "moved_m": "",
                        "place_name": "",
                        "query": "",
                        "status": "skipped_same_address_stack",
                    }
                )
            continue
        to_fix[coords] = ganim

    return to_fix, skipped_rows


def print_summary(stacked: dict[tuple[float, float], list[dict[str, Any]]]) -> None:
    # Group stacks by city for display
    by_city: dict[str, list[tuple[tuple[float, float], list[dict[str, Any]]]]] = defaultdict(list)
    for coords, ganim in sorted(stacked.items(), key=lambda x: -len(x[1])):
        sample_city = str(ganim[0].get("city") or "?")
        by_city[sample_city].append((coords, ganim))

    total_ganim = sum(len(v) for v in stacked.values())
    print(f"\n{'='*60}")
    print(f"Stacked coordinate groups: {len(stacked)} groups, {total_ganim} ganim total")
    print(f"{'='*60}")
    for city, groups in sorted(by_city.items(), key=lambda x: -sum(len(g[1]) for g in x[1])):
        city_total = sum(len(g[1]) for g in groups)
        print(f"\n  {city}  ({city_total} ganim in {len(groups)} stack(s))")
        for (lat, lon), ganim in sorted(groups, key=lambda x: -len(x[1])):
            with_addr = sum(1 for g in ganim if str(g.get("address") or "").strip())
            print(f"    ({lat:.4f}, {lon:.4f})  {len(ganim)} ganim  |  {with_addr} with address")
    print()


# ---------------------------------------------------------------------------
# Phase 2: geocode + (optionally) apply
# ---------------------------------------------------------------------------

def process_stacked(
    stacked: dict[tuple[float, float], list[dict[str, Any]]],
    mapbox_token: str,
    rate_limit_ms: int,
) -> list[dict[str, Any]]:
    """Geocode all stacked ganim that have an address. Returns report rows."""
    report: list[dict[str, Any]] = []
    all_ganim = [g for ganim in stacked.values() for g in ganim]
    stack_size_for = {
        g["id"]: len(stacked[(float(g["lat"]), float(g["lon"]))])
        for g in all_ganim
    }

    total = len(all_ganim)
    geocoded = skipped_no_addr = no_result = 0

    for i, row in enumerate(all_ganim):
        gan_id = str(row.get("id") or "")
        name_he = str(row.get("name_he") or "")
        city_s = str(row.get("city") or "").strip()
        address_s = str(row.get("address") or "").strip()
        old_lat = float(row["lat"])
        old_lon = float(row["lon"])
        stack_size = stack_size_for.get(gan_id, 0)

        base = {
            "id": gan_id,
            "name_he": name_he,
            "city": city_s,
            "address": address_s,
            "old_lat": old_lat,
            "old_lon": old_lon,
            "stack_size": stack_size,
        }

        if not address_s:
            skipped_no_addr += 1
            report.append({**base, "new_lat": "", "new_lon": "", "moved_m": "",
                            "place_name": "", "query": "", "status": "no_address"})
            continue

        query = build_query(address_s, city_s or None)
        proximity = CITY_CENTERS.get(city_s) if city_s else None

        geo = mapbox_geocode(query, mapbox_token, proximity=proximity)
        time.sleep(max(rate_limit_ms, 0) / 1000.0)

        if not geo:
            no_result += 1
            report.append({**base, "new_lat": "", "new_lon": "", "moved_m": "",
                            "place_name": "", "query": query, "status": "no_result"})
        else:
            moved = haversine_m(old_lat, old_lon, geo.lat, geo.lon)
            geocoded += 1
            report.append({**base, "new_lat": geo.lat, "new_lon": geo.lon,
                            "moved_m": round(moved, 1), "place_name": geo.place_name,
                            "query": query, "status": "ok"})

        if (i + 1) % 25 == 0:
            print(f"  [{i+1}/{total}] geocoded={geocoded}  no_result={no_result}  no_address={skipped_no_addr}")

    print(f"\nGeocoding done: {geocoded} ok, {no_result} no_result, {skipped_no_addr} no_address")
    return report


def apply_updates(
    report: list[dict[str, Any]],
    sb: Any,
    rate_limit_ms: int,
    backup_path: Path,
) -> None:
    candidates = [r for r in report if r.get("status") == "ok"]

    to_update: list[dict[str, Any]] = []
    skipped_same_in_report = 0
    for r in candidates:
        if report_row_old_new_same_point(r):
            skipped_same_in_report += 1
            continue
        to_update.append(r)

    if not to_update:
        print("No rows need a DB update (old and new coordinates match on every status=ok row).")
        print(f"  status=ok in report: {len(candidates)}")
        return

    print(
        f"Apply filter: status=ok={len(candidates)}  "
        f"skipped (old=new in report): {skipped_same_in_report}  |  will update: {len(to_update)}"
    )

    with open(backup_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "old_lat", "old_lon"])
        w.writeheader()
        for r in to_update:
            w.writerow(
                {
                    "id": str(r["id"]),
                    "old_lat": r.get("old_lat", ""),
                    "old_lon": r.get("old_lon", ""),
                }
            )
    print(f"Backup written: {backup_path}")

    total = len(to_update)
    updated = failed = 0
    print(f"Applying {total} updates to ganim_v2.location ...")

    for i, r in enumerate(to_update):
        rid = r["id"]
        lat, lon = float(r["new_lat"]), float(r["new_lon"])
        location_wkt = f"SRID=4326;POINT({lon} {lat})"
        try:
            sb.table("ganim_v2").update({"location": location_wkt}).eq("id", rid).execute()
            updated += 1
        except Exception as e:
            failed += 1
            print(f"  [FAIL {i+1}/{total}] {rid}: {e}")
        time.sleep(max(rate_limit_ms, 0) / 1000.0)

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{total}] updated={updated}  failed={failed}")

    print(f"\nApply done: updated={updated}  failed={failed}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        description="Find ganim stacked at the same coordinates and re-geocode them."
    )
    ap.add_argument(
        "--min-stack",
        type=int,
        default=3,
        metavar="N",
        help="Minimum number of ganim sharing the same exact lat/lon to be considered stacked (default: 3).",
    )
    ap.add_argument(
        "--apply",
        action="store_true",
        help="Write new coordinates to ganim_v2 in Supabase. Without this flag the script is a dry run.",
    )
    ap.add_argument(
        "--rate-limit-ms",
        type=int,
        default=120,
        metavar="MS",
        help="Sleep between Mapbox calls in milliseconds (default: 120).",
    )
    ap.add_argument(
        "--same-address-protect-min",
        type=int,
        default=8,
        metavar="N",
        help=(
            "Skip geocoding stacks with at least N ganim where every row has the same non-empty "
            "address text (one building / campus). Set to 0 to disable. Default: 8 (more than 7)."
        ),
    )
    args = ap.parse_args()

    load_env()

    supabase_url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
    supabase_key = require_env_any(
        [
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

    # --- Fetch all ganim ---
    print("Fetching ganim from Supabase ...")
    try:
        res = sb.rpc("get_all_ganim", {"p_limit": 100_000}).execute()
        rows = res.data if hasattr(res, "data") else None
    except Exception as e:
        print(f"Error calling get_all_ganim: {e}")
        return 1
    if not isinstance(rows, list):
        print("Unexpected response from get_all_ganim.")
        return 1
    print(f"Fetched {len(rows)} ganim.")

    # --- Phase 1: find stacks ---
    stacked = find_stacked(rows, args.min_stack)
    if not stacked:
        print(f"No stacked groups found (min_stack={args.min_stack}). Nothing to do.")
        return 0
    print_summary(stacked)

    stacked_to_fix, skipped_same_addr = partition_stacked_skip_same_address(
        stacked, args.same_address_protect_min
    )
    if skipped_same_addr:
        print(
            f"Protected {len(skipped_same_addr)} ganim in large same-address stacks "
            f"(>= {args.same_address_protect_min} ganim, identical address text). "
            f"No Mapbox calls for these; status=skipped_same_address_stack in CSV."
        )
    if not stacked_to_fix:
        print("No stacks left to geocode after same-address protection.")
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        out_dir = repo_root() / "scripts" / "maintenance" / "out"
        out_dir.mkdir(parents=True, exist_ok=True)
        suffix = "apply" if args.apply else "dryrun"
        report_path = out_dir / f"regeocode_stacked_{suffix}_{ts}.csv"
        with open(report_path, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=REPORT_COLUMNS)
            w.writeheader()
            for r in skipped_same_addr:
                w.writerow({k: r.get(k, "") for k in REPORT_COLUMNS})
        print(f"Report: {report_path}")
        if args.apply:
            print("Nothing to apply (only protected rows).")
        return 0

    # --- Phase 2: geocode ---
    mode = "APPLY" if args.apply else "DRY RUN"
    print(
        f"Mode: {mode}  |  min_stack={args.min_stack}  |  "
        f"same_address_protect_min={args.same_address_protect_min}  |  rate_limit={args.rate_limit_ms}ms"
    )
    print("Geocoding stacked ganim ...")
    report = process_stacked(stacked_to_fix, mapbox_token, args.rate_limit_ms)
    report.extend(skipped_same_addr)

    # --- Write report CSV ---
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = repo_root() / "scripts" / "maintenance" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    suffix = "apply" if args.apply else "dryrun"
    report_path = out_dir / f"regeocode_stacked_{suffix}_{ts}.csv"

    with open(report_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=REPORT_COLUMNS)
        w.writeheader()
        for r in report:
            w.writerow({k: r.get(k, "") for k in REPORT_COLUMNS})
    print(f"Report: {report_path}")

    # --- Apply (if requested) ---
    if args.apply:
        backup_path = out_dir / f"regeocode_stacked_backup_{ts}.csv"
        apply_updates(report, sb, args.rate_limit_ms, backup_path)
    else:
        ok_count = sum(1 for r in report if r.get("status") == "ok")
        print(f"\nDry run complete. {ok_count} ganim would be updated.")
        print("Re-run with --apply to write changes to the database.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        raise SystemExit(130)
