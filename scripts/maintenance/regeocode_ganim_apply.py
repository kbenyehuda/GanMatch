#!/usr/bin/env python3
"""
Apply re-geocoded coordinates to Supabase (ganim.location).

Reads input produced by `regeocode_ganim_dryrun.py` (xlsx or csv) and updates
`public.ganim.location` to the new POINT(lon lat) for rows with status=ok.

Safety:
- Requires Supabase service role key in `.env.local`
- Creates a backup CSV of current coords for all IDs it is about to touch
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


REPORT_COLUMNS = {
    "id",
    "new_lat",
    "new_lon",
    "status",
}


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
    raise RuntimeError(f"Missing required environment variable (any of): {', '.join(names)}")


def is_finite_number(x: Any) -> bool:
    try:
        n = float(x)
        return math.isfinite(n)
    except Exception:
        return False


def parse_rows_from_csv(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if not isinstance(r, dict):
                continue
            rows.append(r)
    return rows


def parse_rows_from_xlsx(path: Path) -> list[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(path)
    ws = wb.active
    values = list(ws.values)
    if not values:
        return []
    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    header_idx = {h: i for i, h in enumerate(headers) if h}

    rows: list[dict[str, Any]] = []
    for tup in values[1:]:
        if tup is None:
            continue
        row: dict[str, Any] = {}
        for h, idx in header_idx.items():
            if idx < len(tup):
                row[h] = tup[idx]
        rows.append(row)
    return rows


def load_report_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".xlsx":
        return parse_rows_from_xlsx(path)
    if path.suffix.lower() == ".csv":
        return parse_rows_from_csv(path)
    raise ValueError("Input must be .xlsx or .csv")


def normalize_report_row(row: dict[str, Any]) -> dict[str, Any] | None:
    # accept both string keys and values from csv/xlsx
    if not isinstance(row, dict):
        return None
    rid = row.get("id")
    status = row.get("status")
    new_lat = row.get("new_lat")
    new_lon = row.get("new_lon")

    rid_s = str(rid).strip() if rid is not None else ""
    status_s = str(status).strip().lower() if status is not None else ""
    if not rid_s:
        return None
    if status_s != "ok":
        return None
    if not (is_finite_number(new_lat) and is_finite_number(new_lon)):
        return None
    return {
        "id": rid_s,
        "new_lat": float(new_lat),
        "new_lon": float(new_lon),
        "status": "ok",
    }


def write_backup_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["id", "old_lat", "old_lon"],
        )
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply re-geocoded gan coordinates to Supabase.")
    parser.add_argument("--input", required=True, help="Path to regeocode_dryrun_*.xlsx or .csv")
    parser.add_argument(
        "--rate-limit-ms",
        type=int,
        default=120,
        help="Sleep between updates (milliseconds). Default: 120ms",
    )
    args = parser.parse_args()

    load_env()

    supabase_url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
    # Apply requires service role to bypass RLS safely.
    supabase_key = require_env_any(["SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"])

    report_path = Path(args.input).expanduser().resolve()
    if not report_path.exists():
        raise FileNotFoundError(f"Input not found: {report_path}")

    raw_rows = load_report_rows(report_path)
    if not raw_rows:
        print("No rows found in input.")
        return 1

    normalized = []
    seen: set[str] = set()
    for r in raw_rows:
        nr = normalize_report_row(r)
        if not nr:
            continue
        if nr["id"] in seen:
            continue
        seen.add(nr["id"])
        normalized.append(nr)

    if not normalized:
        print("No applicable rows (status=ok with new_lat/new_lon) found in input.")
        return 1

    sb = create_client(supabase_url, supabase_key)

    # Backup current coordinates for the IDs we will update
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = repo_root() / "scripts" / "maintenance" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    backup_path = out_dir / f"regeocode_backup_before_apply_{ts}.csv"

    # Use RPC to get lat/lon reliably (derived from location)
    # Then filter down to the ids we touch.
    id_set = {r["id"] for r in normalized}
    backup_rows: list[dict[str, Any]] = []
    try:
        res = sb.rpc("get_all_ganim", {"p_limit": 20000}).execute()
        all_rows = res.data if hasattr(res, "data") else None
        if isinstance(all_rows, list):
            for row in all_rows:
                if not isinstance(row, dict):
                    continue
                rid = str(row.get("id") or "").strip()
                if rid in id_set:
                    backup_rows.append(
                        {
                            "id": rid,
                            "old_lat": row.get("lat", ""),
                            "old_lon": row.get("lon", ""),
                        }
                    )
    except Exception as e:
        print(f"Warning: could not build full backup via get_all_ganim: {e}")

    write_backup_csv(backup_path, backup_rows)

    total = len(normalized)
    updated = 0
    failed = 0

    print("=== APPLY: Updating Supabase ganim.location ===")
    print(f"Input: {report_path}")
    print(f"Rows to update (status=ok): {total}")
    print(f"Backup written: {backup_path}")

    for i, r in enumerate(normalized):
        rid = r["id"]
        lat = float(r["new_lat"])
        lon = float(r["new_lon"])

        # PostGIS expects POINT(lon lat)
        location_wkt = f"SRID=4326;POINT({lon} {lat})"
        try:
            sb.table("ganim").update({"location": location_wkt}).eq("id", rid).execute()
            updated += 1
        except Exception as e:
            failed += 1
            print(f"  [FAIL {i+1}/{total}] {rid}: {e}")

        if (i + 1) % 50 == 0:
            print(f"  [{i+1}/{total}] updated: {updated}, failed: {failed}")

        time.sleep(max(args.rate_limit_ms, 0) / 1000.0)

    print("\n=== Done ===")
    print(f"Updated: {updated}")
    print(f"Failed: {failed}")
    print("Note: This script only updates `ganim.location` (not address text).")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

