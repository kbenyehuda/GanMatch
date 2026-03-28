#!/usr/bin/env python3
"""
Backfill ganim_v2 rows where gov maon_type_code is missing (NULL or blank).

Mirrors the cohort from:
  WHERE (metadata->'gov'->>'maon_type_code') IS NULL
     OR btrim(metadata->'gov'->>'maon_type_code') = ''

Rules (idempotent where possible):
1. raw_address contains "מוכר/פרטי: פרטי" (first token after the label) → category PRIVATE_GAN,
   private_supervision SUPERVISED, clear maon_symbol_code and other category-only columns.
2. Normalize metadata.phone to validated Israeli landline/mobile; set metadata.phone_whatsapp
   to mobile numbers only (05x / 9725…) so the app uses wa.me for those and tel: for landlines.
3. Parse metadata age_groups into min_age_months / max_age_months when columns are still NULL.
4. Copy metadata.hours into operating_hours when valid "HH:MM-HH:MM" and operating_hours is empty.

Default is dry-run. Use --apply to write.

Use --output-csv PATH to export proposed new values per row (see CSV_FIELDNAMES in source).

Env: SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

try:
    from supabase import create_client
except Exception:
    create_client = None  # type: ignore

PRIVATE_PUBLIC_RE = re.compile(r"מוכר/פרטי:\s*(\S+)")
HOURS_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$")
YEAR_RANGE_RE = re.compile(r"(\d+)\s*[-–]\s*(\d+)")
DIGITS_RE = re.compile(r"\D+")


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


def missing_maon_type_code(metadata: Any) -> bool:
    if not isinstance(metadata, dict):
        return True
    gov = metadata.get("gov")
    if not isinstance(gov, dict):
        return True
    v = gov.get("maon_type_code")
    if v is None:
        return True
    return str(v).strip() == ""


def extract_private_public_token(raw_address: str | None) -> str | None:
    if not raw_address or not str(raw_address).strip():
        return None
    m = PRIVATE_PUBLIC_RE.search(str(raw_address))
    return m.group(1).strip() if m else None


def to_digits(s: str) -> str:
    return DIGITS_RE.sub("", s or "")


def to_local0(digits: str) -> str | None:
    if not digits:
        return None
    d = digits
    if d.startswith("972"):
        d = "0" + d[3:]
    if d.startswith("0") and len(d) in (9, 10):
        return d
    return None


def is_valid_il_phone(digits: str) -> bool:
    if not digits:
        return False
    if digits.startswith("0"):
        return len(digits) in (9, 10)
    if digits.startswith("972"):
        return len(digits) in (11, 12)
    return False


def is_israeli_mobile_local0(local0: str) -> bool:
    return len(local0) == 10 and local0.startswith("05")


def format_il_display(local0: str) -> str:
    if len(local0) == 10:
        return f"{local0[:3]}-{local0[3:6]}-{local0[6:]}"
    if len(local0) == 9:
        return f"{local0[:2]}-{local0[2:]}"
    return local0


def normalize_phone_entry(raw: str) -> tuple[str | None, bool]:
    """Returns (display_string, is_mobile) or (None, False) if invalid."""
    d = to_digits(raw)
    if not is_valid_il_phone(d):
        return None, False
    local = to_local0(d)
    if not local:
        return None, False
    mob = is_israeli_mobile_local0(local)
    return format_il_display(local), mob


def collect_raw_phone_strings(metadata: dict[str, Any]) -> list[str]:
    out: list[str] = []
    ph = metadata.get("phone")
    if isinstance(ph, list):
        for x in ph:
            if isinstance(x, str) and x.strip():
                out.append(x.strip())
    elif isinstance(ph, str) and ph.strip():
        out.append(ph.strip())

    gov = metadata.get("gov")
    raw: dict[str, Any] = {}
    if isinstance(gov, dict):
        r = gov.get("raw")
        if isinstance(r, dict):
            raw = r
    for key in ("מספר טלפון", "TELEPHONE", "phone"):
        v = raw.get(key)
        if isinstance(v, str) and v.strip() and v.strip() not in ("אין", "0"):
            out.append(v.strip())
    return out


def parse_operating_hours(hours: Any) -> str | None:
    if not isinstance(hours, str):
        return None
    s = hours.strip()
    if not s or not HOURS_RE.match(s):
        return None
    return s


def parse_age_groups_months(metadata: dict[str, Any]) -> tuple[int | None, int | None]:
    """
    Derive min/max age in months from metadata.age_groups (JSON array, JSON string, or list).
    Ranges like 0-3 are treated as years when both ends are <= 12.
    """
    raw = metadata.get("age_groups")
    texts: list[str] = []
    if isinstance(raw, list):
        for x in raw:
            if isinstance(x, str) and x.strip():
                texts.append(x.strip())
    elif isinstance(raw, str) and raw.strip():
        t = raw.strip()
        try:
            parsed = json.loads(t)
            if isinstance(parsed, list):
                for x in parsed:
                    if isinstance(x, str) and x.strip():
                        texts.append(x.strip())
            else:
                texts.append(t)
        except json.JSONDecodeError:
            texts.append(t)

    if not texts:
        return None, None

    mins: list[int] = []
    maxs: list[int] = []
    for chunk in texts:
        for m in YEAR_RANGE_RE.finditer(chunk):
            a = int(m.group(1))
            b = int(m.group(2))
            if a > b:
                a, b = b, a
            # Years vs months heuristic
            if a <= 12 and b <= 12:
                mins.append(a * 12)
                maxs.append(b * 12)
            else:
                mins.append(a)
                maxs.append(b)

    if not mins or not maxs:
        return None, None
    return min(mins), max(maxs)


def sanitize_category_subfields(category: str, payload: dict[str, Any]) -> None:
    cat = category.strip().upper() or "UNSPECIFIED"
    allows_maon = cat in {"MAON_SYMBOL", "MISHPACHTON", "TZAHARON_MUNICIPAL"}
    if not allows_maon:
        payload["maon_symbol_code"] = None
    if cat != "PRIVATE_GAN":
        payload["private_supervision"] = None
    if cat != "MISHPACHTON":
        payload["mishpachton_affiliation"] = None
    if cat != "MUNICIPAL_GAN":
        payload["municipal_grade"] = None


def build_patch(row: dict[str, Any]) -> dict[str, Any] | None:
    meta = row.get("metadata")
    if not isinstance(meta, dict):
        meta = {}

    patch: dict[str, Any] = {}
    new_meta = dict(meta)

    raw_address = meta.get("raw_address")
    if isinstance(raw_address, str):
        token = extract_private_public_token(raw_address)
        if token == "פרטי":
            patch["category"] = "PRIVATE_GAN"
            patch["maon_symbol_code"] = None
            patch["mishpachton_affiliation"] = None
            patch["municipal_grade"] = None
            patch["private_supervision"] = "SUPERVISED"

    # Phones
    raw_phones = collect_raw_phone_strings(meta)
    seen: set[str] = set()
    display_list: list[str] = []
    whatsapp_list: list[str] = []
    for r in raw_phones:
        disp, mob = normalize_phone_entry(r)
        if not disp:
            continue
        key = to_digits(disp)[-9:]
        if key in seen:
            continue
        seen.add(key)
        display_list.append(disp)
        if mob:
            whatsapp_list.append(disp)

    if display_list:

        def norm_nine(lst: Any) -> list[str] | None:
            if not isinstance(lst, list):
                return None
            out = []
            for x in lst:
                if not isinstance(x, str):
                    return None
                d = to_digits(x)
                if len(d) < 9:
                    return None
                out.append(d[-9:])
            return out

        prev_ph = norm_nine(meta.get("phone"))
        next_ph = [to_digits(x)[-9:] for x in display_list]
        prev_wa = norm_nine(meta.get("phone_whatsapp"))
        next_wa = [to_digits(x)[-9:] for x in whatsapp_list]
        if prev_ph != next_ph or prev_wa != next_wa:
            new_meta["phone"] = display_list
            new_meta["phone_whatsapp"] = whatsapp_list

    hours = parse_operating_hours(meta.get("hours"))
    op = row.get("operating_hours")
    op_empty = op is None or (isinstance(op, str) and not op.strip())
    if hours and op_empty:
        patch["operating_hours"] = hours

    min_age, max_age = parse_age_groups_months(meta)
    if min_age is not None and max_age is not None and min_age <= max_age:
        if row.get("min_age_months") is None:
            patch["min_age_months"] = min_age
        if row.get("max_age_months") is None:
            patch["max_age_months"] = max_age

    if new_meta != meta:
        patch["metadata"] = new_meta

    if not patch:
        return None

    if "category" in patch:
        sanitize_category_subfields(str(patch["category"]), patch)
    return patch


def patch_to_csv_row(row: dict[str, Any], patch: dict[str, Any]) -> dict[str, str]:
    """Flatten patch into CSV-safe strings (empty = field not written by this patch)."""
    p = {k: v for k, v in patch.items() if k != "updated_at"}
    meta = p.get("metadata")
    phone_new = ""
    wa_new = ""
    if isinstance(meta, dict):
        ph = meta.get("phone")
        if isinstance(ph, list):
            phone_new = json.dumps(ph, ensure_ascii=False)
        wa = meta.get("phone_whatsapp")
        if isinstance(wa, list):
            wa_new = json.dumps(wa, ensure_ascii=False)

    def cell(key: str) -> str:
        if key not in p:
            return ""
        v = p[key]
        if v is None:
            return "NULL"
        return str(v)

    return {
        "id": str(row.get("id", "")),
        "name_he": str(row.get("name_he") or ""),
        "patch_keys": ";".join(sorted(k for k in p if k != "metadata")),
        "category_new": cell("category"),
        "maon_symbol_code_new": cell("maon_symbol_code"),
        "private_supervision_new": cell("private_supervision"),
        "mishpachton_affiliation_new": cell("mishpachton_affiliation"),
        "municipal_grade_new": cell("municipal_grade"),
        "operating_hours_new": cell("operating_hours"),
        "min_age_months_new": cell("min_age_months"),
        "max_age_months_new": cell("max_age_months"),
        "metadata_phone_new": phone_new,
        "metadata_phone_whatsapp_new": wa_new,
    }


CSV_FIELDNAMES = [
    "id",
    "name_he",
    "patch_keys",
    "category_new",
    "maon_symbol_code_new",
    "private_supervision_new",
    "mishpachton_affiliation_new",
    "municipal_grade_new",
    "operating_hours_new",
    "min_age_months_new",
    "max_age_months_new",
    "metadata_phone_new",
    "metadata_phone_whatsapp_new",
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write updates to Supabase")
    parser.add_argument("--limit", type=int, default=0, help="Max rows to update (0 = no limit)")
    parser.add_argument(
        "--output-csv",
        type=Path,
        metavar="PATH",
        help="Write one row per proposed update with new column values (UTF-8 with BOM for Excel)",
    )
    args = parser.parse_args()

    if create_client is None:
        print("Install supabase: pip install supabase", file=sys.stderr)
        return 1

    load_env()
    url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
    key = require_env_any(["SUPABASE_SERVICE_ROLE_KEY"])
    sb = create_client(url, key)

    page_size = 500
    offset = 0
    scanned = 0
    matched = 0
    updated = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    csv_path: Path | None = args.output_csv
    csv_fh = None
    csv_writer: csv.DictWriter[str] | None = None
    if csv_path is not None:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        csv_fh = open(csv_path, "w", encoding="utf-8-sig", newline="")
        csv_writer = csv.DictWriter(csv_fh, fieldnames=CSV_FIELDNAMES, extrasaction="ignore")
        csv_writer.writeheader()

    try:
        while True:
            q = (
                sb.table("ganim_v2")
                .select(
                    "id,name_he,category,maon_symbol_code,private_supervision,mishpachton_affiliation,"
                    "municipal_grade,metadata,operating_hours,min_age_months,max_age_months"
                )
                .range(offset, offset + page_size - 1)
            )
            res = q.execute()
            rows = res.data or []
            if not rows:
                break

            for row in rows:
                scanned += 1
                meta = row.get("metadata")
                if not missing_maon_type_code(meta):
                    continue
                matched += 1
                patch = build_patch(row)
                if not patch:
                    continue
                if args.limit and updated >= args.limit:
                    print(f"Stopped at --limit {args.limit}")
                    print(f"scanned={scanned} matched_cohort={matched} would_update/applied={updated}")
                    if csv_path is not None:
                        print(f"CSV written (partial): {csv_path.resolve()}")
                    return 0

                if csv_writer is not None:
                    csv_writer.writerow(patch_to_csv_row(row, patch))

                patch["updated_at"] = now_iso
                rid = row["id"]
                if args.apply:
                    sb.table("ganim_v2").update(patch).eq("id", rid).execute()
                updated += 1
                action = "apply" if args.apply else "dry-run"
                print(f"{action} id={rid} keys={sorted(k for k in patch if k != 'updated_at')}")

            if len(rows) < page_size:
                break
            offset += page_size
    finally:
        if csv_fh is not None:
            csv_fh.close()

    print(f"done scanned={scanned} matched_cohort={matched} {'applied' if args.apply else 'dry_run'}={updated}")
    if csv_path is not None:
        print(f"CSV written: {csv_path.resolve()}")
    if not args.apply and updated:
        print("Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
