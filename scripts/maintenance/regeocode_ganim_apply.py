#!/usr/bin/env python3
"""
Apply re-geocoded coordinates to Supabase (ganim_v2.location).

Not part of the GanMatch app runtime—optional operator script only.

Reads input produced by `regeocode_ganim_dryrun.py` (or any CSV/XLSX with the same
columns): loads rows with status=ok, drops rows where old_lat/old_lon already match
new_lat/new_lon in the file, then updates `public.ganim_v2.location` for the rest.

Safety:
- Requires Supabase service role key in `.env.local` (not needed for `--count-only`)
- Creates a backup CSV of current coords for all IDs it is about to touch

Preview: `python regeocode_ganim_apply.py --input path/to/report.csv --count-only`
"""

from __future__ import annotations

import argparse
import csv
import math
import os
import time
from collections import Counter
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


# Rounded comparison so CSV float formatting does not force spurious updates.
_COORD_DECIMALS = 7


def csv_old_new_same_point(old_lat: Any, old_lon: Any, new_lat: float, new_lon: float) -> bool:
    """True if the report row's old and new coordinates are the same (per file), so skip DB write."""
    if not (is_finite_number(old_lat) and is_finite_number(old_lon)):
        return False
    ola, olo = float(old_lat), float(old_lon)
    return round(ola, _COORD_DECIMALS) == round(new_lat, _COORD_DECIMALS) and round(
        olo, _COORD_DECIMALS
    ) == round(new_lon, _COORD_DECIMALS)


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
    nla, nlo = float(new_lat), float(new_lon)
    out: dict[str, Any] = {
        "id": rid_s,
        "new_lat": nla,
        "new_lon": nlo,
        "status": "ok",
    }
    ola, olo = row.get("old_lat"), row.get("old_lon")
    if is_finite_number(ola) and is_finite_number(olo):
        out["old_lat"] = float(ola)
        out["old_lon"] = float(olo)
    return out


def build_apply_plan(raw_rows: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Same filtering as real apply: status=ok, dedupe id, skip when old==new in file.
    Returns counts and lists for --count-only.
    """
    status_counts = Counter(
        str(r.get("status") or "").strip().lower() if isinstance(r, dict) else ""
        for r in raw_rows
    )

    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in raw_rows:
        nr = normalize_report_row(r)
        if not nr:
            continue
        if nr["id"] in seen:
            continue
        seen.add(nr["id"])
        normalized.append(nr)

    skipped_same = 0
    would_update: list[dict[str, Any]] = []
    ok_missing_old = 0
    for r in normalized:
        if csv_old_new_same_point(r.get("old_lat"), r.get("old_lon"), r["new_lat"], r["new_lon"]):
            skipped_same += 1
            continue
        would_update.append(r)
        if "old_lat" not in r or "old_lon" not in r:
            ok_missing_old += 1

    return {
        "total_rows": len(raw_rows),
        "status_counts": dict(status_counts),
        "status_ok_deduped": len(normalized),
        "skipped_old_equals_new": skipped_same,
        "would_update": len(would_update),
        "would_update_missing_old_columns": ok_missing_old,
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
        "--count-only",
        action="store_true",
        help="Print how many rows would update the DB (same rules as apply); no Supabase, no .env.",
    )
    parser.add_argument(
        "--rate-limit-ms",
        type=int,
        default=120,
        help="Sleep between updates (milliseconds). Default: 120ms",
    )
    args = parser.parse_args()

    report_path = Path(args.input).expanduser().resolve()
    if not report_path.exists():
        raise FileNotFoundError(f"Input not found: {report_path}")

    raw_rows = load_report_rows(report_path)
    if not raw_rows:
        print("No rows found in input.")
        return 1

    if args.count_only:
        plan = build_apply_plan(raw_rows)
        print(f"File: {report_path}")
        print(f"Total rows in file: {plan['total_rows']}")
        if plan["status_counts"]:
            print("Rows by status (raw):")
            for k, v in sorted(plan["status_counts"].items(), key=lambda x: (-x[1], x[0])):
                label = k if k else "(empty)"
                print(f"  {label}: {v}")
        print(f"status=ok (deduped by id): {plan['status_ok_deduped']}")
        print(f"Skipped (old_lat/old_lon == new in file, after rounding): {plan['skipped_old_equals_new']}")
        print(f"Would update ganim_v2.location: {plan['would_update']}")
        if plan["would_update_missing_old_columns"]:
            print(
                f"  (of those, {plan['would_update_missing_old_columns']} lack old_lat/old_lon in file "
                "— still counted as updates because apply cannot treat them as unchanged.)"
            )
        return 0

    load_env()

    supabase_url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
    # Apply requires service role to bypass RLS safely.
    supabase_key = require_env_any(["SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY"])

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

    to_apply: list[dict[str, Any]] = []
    skipped_same_in_file = 0
    for r in normalized:
        if csv_old_new_same_point(r.get("old_lat"), r.get("old_lon"), r["new_lat"], r["new_lon"]):
            skipped_same_in_file += 1
            continue
        to_apply.append(r)

    if not to_apply:
        print("=== APPLY: no rows need a DB update ===")
        print(f"Input: {report_path}")
        print(f"status=ok rows in file: {len(normalized)}")
        print(
            f"Skipped {skipped_same_in_file} row(s): old_lat/old_lon equals new_lat/new_lon in the file "
            "(after rounding); nothing to write."
        )
        return 0

    # Backup: coords from the CSV row we are replacing (old_*)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = repo_root() / "scripts" / "maintenance" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    backup_path = out_dir / f"regeocode_backup_before_apply_{ts}.csv"

    backup_rows: list[dict[str, Any]] = []
    for r in to_apply:
        backup_rows.append(
            {
                "id": r["id"],
                "old_lat": r.get("old_lat", ""),
                "old_lon": r.get("old_lon", ""),
            }
        )

    write_backup_csv(backup_path, backup_rows)

    total = len(to_apply)
    updated = 0
    failed = 0

    print("=== APPLY: Updating Supabase ganim_v2.location ===")
    print(f"Input: {report_path}")
    print(f"status=ok rows in file: {len(normalized)}")
    print(f"Skipped (old and new coordinates identical in file): {skipped_same_in_file}")
    print(f"Rows to update: {total}")
    print(f"Backup written: {backup_path}")

    for i, r in enumerate(to_apply):
        rid = r["id"]
        lat = float(r["new_lat"])
        lon = float(r["new_lon"])

        # PostGIS expects POINT(lon lat)
        location_wkt = f"SRID=4326;POINT({lon} {lat})"
        try:
            sb.table("ganim_v2").update({"location": location_wkt}).eq("id", rid).execute()
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
    if skipped_same_in_file:
        print(f"Skipped (unchanged in CSV old vs new): {skipped_same_in_file}")
    print("Note: This script only updates `ganim_v2.location` (not address text).")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())

