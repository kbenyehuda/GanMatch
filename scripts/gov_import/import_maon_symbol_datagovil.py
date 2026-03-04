#!/usr/bin/env python3
"""
Import supervised daycare ("מעונות יום" / SEMEL_MAON) from data.gov.il into public.ganim_v2.

Safe-by-default:
- Deterministic UUIDs (uuid5) so re-runs upsert instead of duplicating
- Dry-run mode (no DB writes)
- Geocoding caps + local cache to control Mapbox cost
- By default, rows that fail geocoding are SKIPPED (no city-center pollution).
  Use --allow-fallback to insert with city-center coords.

Requires (already used by existing scripts):
  pip install -r scripts/scraper/requirements.txt

Env (loaded from repo root .env.local):
  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (write mode only)
  MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
  DATAGOVIL_MAON_RESOURCE_ID (optional; can pass --resource-id)
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import re
import struct
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote as urlquote

import requests
from dotenv import load_dotenv

try:
    from supabase import create_client
except Exception:
    create_client = None  # type: ignore

try:
    from openai import OpenAI
except Exception:
    OpenAI = None  # type: ignore

try:
    import openpyxl  # type: ignore
except Exception:
    openpyxl = None  # type: ignore

_HEBREW_RE = re.compile(r"[\u0590-\u05FF]")


def reverse_for_ltr_console(s: str) -> str:
    """
    Many Windows terminals render RTL (Hebrew) poorly. For trace readability only,
    return a reversed version when Hebrew chars are present.
    """
    if not s:
        return s
    if not _HEBREW_RE.search(s):
        return s
    return s[::-1]


def trace_kv(trace: "TraceLogger", key: str, value: str) -> None:
    """
    Log key/value and an additional *_rtl line when the value contains Hebrew.
    """
    trace.log(f"{key}={value!r}")
    vrtl = reverse_for_ltr_console(value)
    if vrtl != value:
        trace.log(f"{key}_rtl={vrtl!r}")


def trace_block(trace: "TraceLogger", title: str, body: str, *, rtl: bool = False) -> None:
    """
    Pretty-print a multi-line block in trace logs.
    If rtl=True, reverse only the lines that contain Hebrew characters.
    """
    trace.log(f"{title} (begin)")
    for raw_line in (body or "").splitlines():
        line = raw_line
        if rtl and _HEBREW_RE.search(line):
            line = reverse_for_ltr_console(line)
        trace.log("  | " + line)
    trace.log(f"{title} (end)")


class TraceLogger:
    def __init__(self, enabled: bool, path: Path | None):
        self.enabled = enabled
        self.path = path
        self._fh = None
        if self.enabled and self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self._fh = open(self.path, "w", encoding="utf-8")

    def close(self) -> None:
        try:
            if self._fh:
                self._fh.close()
        except Exception:
            pass

    def log(self, msg: str) -> None:
        if not self.enabled:
            return
        line = msg.rstrip("\n")
        print(line, flush=True)
        if self._fh:
            try:
                self._fh.write(line + "\n")
                self._fh.flush()
            except Exception:
                pass


API_URL = "https://data.gov.il/api/3/action/datastore_search"

# Note: resource IDs change when the gov publishes a new year's file.
# Keep this overrideable via env/flag.
DEFAULT_RESOURCE_ID = "08608442-f54a-44e2-a0b4-3a563a35f302"

# Deterministic namespace for external IDs.
ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://ganmatch.app/import")


CITY_CENTERS: dict[str, tuple[float, float]] = {
    "גבעתיים": (32.0702, 34.8117),
    "תל אביב": (32.0853, 34.7818),
    "תל אביב-יפו": (32.0853, 34.7818),
    "רמת גן": (32.0823, 34.8107),
    "ירושלים": (31.778, 35.235),
    "חיפה": (32.794, 34.989),
}


def repo_root() -> Path:
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


def ensure_upsert_ganim_v2_rpc_available(sb: Any) -> None:
    """
    Fail fast if the Supabase PostgREST schema cache doesn't have upsert_ganim_v2.

    We do a "safe probe" call that must fail BEFORE any insert (invalid UUID cast),
    but still proves the RPC exists in schema cache.
    """
    try:
        sb.rpc(
            "upsert_ganim_v2",
            {
                "p_id": "not-a-uuid",
                "p_name_he": "_probe_",
                "p_lon": 0,
                "p_lat": 0,
                "p_category": "UNSPECIFIED",
                "p_maon_symbol_code": None,
                "p_is_verified": False,
                "p_metadata": {"probe": True},
                "p_is_fallback": True,
            },
        ).execute()
    except Exception as e:
        s = str(e)
        # If the RPC exists, Postgres should reject the UUID cast.
        if "invalid input syntax for type uuid" in s.lower() or "uuid" in s.lower():
            return
        # If PostgREST can't find it, we get PGRST202.
        if "PGRST202" in s or "Could not find the function public.upsert_ganim_v2" in s:
            raise RuntimeError(
                "Supabase RPC `public.upsert_ganim_v2` is not available via PostgREST schema cache.\n"
                "Fix: apply migration `supabase/migrations/20260303012000_upsert_ganim_v2_rpc.sql` "
                "in the Supabase SQL editor, then reload the API schema (or wait for cache refresh)."
            )
        # Other errors: surface them.
        raise


def now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def norm_city(s: str) -> str:
    s = (s or "").strip()
    s = s.replace("״", '"').replace("׳", "'")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("-", " ").strip()
    return s


def contains_any(text: str, needles: list[str]) -> bool:
    t = norm_city(text)
    for n in needles:
        nn = norm_city(n)
        if nn and nn in t:
            return True
    return False


def extract_city_from_place_name(place_name: str) -> str | None:
    """
    Best-effort extraction of the "city" portion from a Mapbox place_name.
    Typical Mapbox IL strings look like: "<street ...>, <city>, ישראל".
    """
    s = (place_name or "").strip()
    if not s:
        return None
    parts = [p.strip() for p in s.split(",") if p.strip()]
    if len(parts) < 2:
        return None

    # Prefer a Hebrew-ish part that is not "ישראל". Usually that's the city.
    for p in parts[1:]:  # skip street/poi name
        if "ישראל" in p:
            continue
        if _HEBREW_RE.search(p):
            return p

    # Fallback: second component, unless it's Israel.
    if "ישראל" not in parts[1]:
        return parts[1]
    return None


def ewkb_point_hex(*, lon: float, lat: float, srid: int = 4326) -> str:
    """
    Return EWKB (with SRID) hex for POINT(lon lat) in little-endian, matching PostGIS.
    Example prefix for SRID 4326 POINT: 0101000020E6100000...
    """
    # EWKB type code for Point + SRID flag (0x20000000)
    wkb_type = 0x20000001
    data = struct.pack("<BIIdd", 1, wkb_type, int(srid), float(lon), float(lat))
    return data.hex().upper()


def _norm_he_simple(s: str) -> str:
    t = (s or "").strip()
    if not t:
        return ""
    # remove quotes/gershayim noise, collapse whitespace/punct
    t = t.replace("״", '"').replace("׳", "'").replace('"', "").replace("'", "")
    t = re.sub(r"[,\.;:\-–—/\\\(\)\[\]\{\}]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _bounded_edit_distance_leq(a: str, b: str, max_dist: int = 2) -> bool:
    """
    True if Levenshtein(a,b) <= max_dist. Optimized for small max_dist (<=2).
    """
    a = a or ""
    b = b or ""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > max_dist:
        return False

    # DP row with early exit
    prev = list(range(lb + 1))
    for i in range(1, la + 1):
        cur = [i] + [0] * lb
        min_in_row = cur[0]
        ai = a[i - 1]
        for j in range(1, lb + 1):
            cost = 0 if ai == b[j - 1] else 1
            cur[j] = min(
                prev[j] + 1,      # deletion
                cur[j - 1] + 1,   # insertion
                prev[j - 1] + cost,  # substitution
            )
            if cur[j] < min_in_row:
                min_in_row = cur[j]
        if min_in_row > max_dist:
            return False
        prev = cur
    return prev[lb] <= max_dist


def parse_street_house_from_address(address: str) -> tuple[str, str]:
    """
    address is stored as "street house" (no city). Return (street_norm, house_digits).
    """
    a = _norm_he_simple(address)
    if not a:
        return ("", "")
    # extract first number group as house (e.g. "53 ב" -> "53")
    m = re.search(r"\b(\d{1,5})\b", a)
    house = m.group(1) if m else ""
    street = a
    if m:
        street = (a[: m.start()] + " " + a[m.end() :]).strip()
        street = re.sub(r"\s+", " ", street).strip()
    return (street, house)


def merge_semel_into_metadata(metadata: dict[str, Any], semel: str) -> dict[str, Any]:
    """
    Ensure metadata.gov.semel_maon_codes contains semel.
    """
    if not semel:
        return metadata
    out = dict(metadata or {})
    gov = out.get("gov")
    if not isinstance(gov, dict):
        gov = {}
    gov_out = dict(gov)
    codes = gov_out.get("semel_maon_codes")
    if not isinstance(codes, list):
        codes = []
    codes_s = []
    seen: set[str] = set()
    for x in codes + [semel]:
        sx = str(x or "").strip()
        if not sx or sx in seen:
            continue
        seen.add(sx)
        codes_s.append(sx)
    gov_out["semel_maon_codes"] = codes_s
    out["gov"] = gov_out
    return out


GANIM_V2_EXPORT_COLUMNS = [
    "id",
    "name_he",
    "name_en",
    "location",
    "address",
    "city",
    "category",
    "maon_symbol_code",
    "private_supervision",
    "mishpachton_affiliation",
    "municipal_grade",
    "has_cctv",
    "cctv_streamed_online",
    "monthly_price_nis",
    "min_age_months",
    "max_age_months",
    "price_notes",
    "metadata",
    "is_verified",
    "suggested_by",
    "suggested_at",
    "created_at",
    "updated_at",
    "website_url",
]


def write_ganim_v2_table_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=GANIM_V2_EXPORT_COLUMNS)
        w.writeheader()
        for r in rows:
            out: dict[str, Any] = {}
            for k in GANIM_V2_EXPORT_COLUMNS:
                v = r.get(k)
                if k == "metadata" and isinstance(v, (dict, list)):
                    out[k] = json.dumps(v, ensure_ascii=False)
                else:
                    out[k] = v
            w.writerow(out)


def write_ganim_v2_table_xlsx(rows: list[dict[str, Any]], path: Path) -> None:
    if openpyxl is None:
        raise RuntimeError("Missing dependency: openpyxl")
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "ganim_v2"

    ws.append(GANIM_V2_EXPORT_COLUMNS)
    for r in rows:
        row_vals: list[Any] = []
        for k in GANIM_V2_EXPORT_COLUMNS:
            v = r.get(k)
            if k == "metadata" and isinstance(v, (dict, list)):
                row_vals.append(json.dumps(v, ensure_ascii=False))
            else:
                row_vals.append(v)
        ws.append(row_vals)

    # Basic usability: freeze header row.
    ws.freeze_panes = "A2"
    wb.save(path)


def _get_openai_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY") or "").strip()


def _dedupe_keep_order(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for x in items:
        s = str(x or "").strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def _normalize_he_for_dedupe(s: str) -> str:
    """
    Conservative normalization used ONLY to dedupe OpenAI-provided variants.
    Keeps meaningful Hebrew letter differences (e.g. המעין vs המעיין) while
    ignoring quote/punctuation/whitespace noise.
    """
    t = (s or "").strip()
    if not t:
        return ""
    t = t.replace("״", '"').replace("׳", "'").replace("“", '"').replace("”", '"').replace("’", "'")
    t = t.replace('"', "").replace("'", "")
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _dedupe_keep_order_normalized(items: Iterable[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for x in items:
        raw = str(x or "").strip()
        if not raw:
            continue
        k = _normalize_he_for_dedupe(raw)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(raw)
    return out


def _sanitize_openai_variants(
    *,
    street_in: str,
    city_in: str,
    street_variants: list[str],
    city_variants: list[str],
    max_items: int,
) -> tuple[list[str], list[str]]:
    """
    Apply guardrails/dedupe to OpenAI-provided variants (and cached variants).

    - Remove duplicates (with conservative normalization)
    - Remove any street variant equal to the input street (post-normalization)
    - Remove any street variant that contains digits or the city name
    - Keep city variants English/transliteration only (no Hebrew, no digits), and dedupe
    """
    street_norm = _normalize_he_for_dedupe(street_in)
    city_norm = (city_in or "").strip()

    sv = _dedupe_keep_order_normalized(street_variants)
    cv = _dedupe_keep_order(city_variants)

    sv = [
        x
        for x in sv
        if x
        and _normalize_he_for_dedupe(x) != street_norm
        and not re.search(r"\d", x)
        and (not city_norm or city_norm not in x)
    ]

    cv = [x for x in cv if x and not _HEBREW_RE.search(x) and not re.search(r"\d", x)]
    cv = _dedupe_keep_order(cv)

    return (sv[:max_items], cv[:max_items])


def openai_city_transliteration_options(
    *,
    city: str,
    cache: "JsonCache",
    max_items: int = 6,
    trace: TraceLogger | None = None,
) -> list[str]:
    """
    Rare fallback: ask OpenAI for English/transliteration spellings for the city.
    Only used when street variants did not help AND we haven't successfully geocoded
    this city yet in the current run.
    """
    city0 = (city or "").strip()
    if not city0:
        return []

    cache_key = f"openai_city_translit:v1:city={city0}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        cv = cached.get("city_variants") if isinstance(cached.get("city_variants"), list) else []
        cv_raw = [str(x).strip() for x in cv if str(x).strip()]
        # English-only, no digits, dedupe
        out = _dedupe_keep_order([x for x in cv_raw if x and not _HEBREW_RE.search(x) and not re.search(r"\d", x)])[:max_items]
        if trace:
            trace.log(f"[openai_city] cache hit key={cache_key}")
            trace.log("[openai_city] city_variants:")
            for x in out:
                trace.log(f"  - {x}")
        return out

    api_key = _get_openai_key()
    if not api_key or not OpenAI:
        if trace:
            if not api_key and not OpenAI:
                trace.log("[openai_city] skipped (missing OPENAI_API_KEY and missing openai package)")
            elif not api_key:
                trace.log("[openai_city] skipped (missing OPENAI_API_KEY / OPENAI_KEY in environment)")
            else:
                trace.log("[openai_city] skipped (missing python package: openai)")
        return []

    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip() or "gpt-4o-mini"
    system = "Return ONLY valid JSON. No markdown. No explanations."
    user = (
        "Return English/transliteration spellings for this Israeli city name.\n"
        "Rules:\n"
        "- English/transliteration ONLY (no Hebrew)\n"
        "- No digits\n"
        "- Unique items only\n"
        "Return JSON with exactly this key:\n"
        '{ "city_variants": [..] }\n'
        f"Max {max_items} items.\n\n"
        f'City (Hebrew): "{city0}"\n'
    )

    try:
        if trace:
            trace.log("[openai_city] REQUEST")
            trace.log(f"[openai_city] model={model}")
            trace_block(trace, "[openai_city] system", system, rtl=False)
            trace_block(trace, "[openai_city] user", user, rtl=False)
            trace_block(trace, "[openai_city] user_rtl", user, rtl=True)
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
        )
        text = (resp.choices[0].message.content or "").strip()
        if trace:
            trace.log("[openai_city] RESPONSE")
            trace_block(trace, "[openai_city] raw_response", text, rtl=False)
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
        if not isinstance(data, dict):
            return []
        cv = data.get("city_variants", [])
        if not isinstance(cv, list):
            cv = []
        cv_out = [str(x).strip() for x in cv if str(x).strip()]
        cv_out = _dedupe_keep_order([x for x in cv_out if x and not _HEBREW_RE.search(x) and not re.search(r"\d", x)])[:max_items]
        cache.set(cache_key, {"city_variants": cv_out})
        if trace:
            trace.log("[openai_city] parsed city_variants:")
            for x in cv_out:
                trace.log(f"  - {x}")
        return cv_out
    except Exception as e:
        if trace:
            trace.log(f"[openai_city] exception: {type(e).__name__}: {e}")
        return []


def _he_basic_variants(s: str) -> list[str]:
    """
    Cheap, deterministic spelling variants for Hebrew-ish strings.

    This is intentionally conservative: we only generate variants that are likely
    to appear in Mapbox `place_name` for Israel, and we avoid anything "creative".
    """
    base = (s or "").strip()
    if not base:
        return []

    variants: list[str] = [base]

    # Normalize quotes/gershayim/geresh (common in abbreviations like התע"ש, קק"ל)
    no_quotes = (
        base.replace("״", '"')
        .replace("׳", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("’", "'")
        .replace('"', "")
        .replace("'", "")
    )
    variants.append(no_quotes)

    # Collapse whitespace and common punctuation differences.
    variants.append(re.sub(r"\s+", " ", base).strip())
    variants.append(re.sub(r"[–—\-]+", " ", base).strip())

    # Remove all spaces (some abbreviations appear without spaces).
    variants.append(re.sub(r"\s+", "", no_quotes))

    # Expand/contract common address tokens.
    # (Even if the input doesn't include these, variants help when Mapbox uses them.)
    v_more: list[str] = []
    for v in variants:
        vv = v
        vv = vv.replace("רח'", "רחוב ").replace('רח״', "רחוב ").replace("רח ", "רחוב ").replace("רח.", "רחוב ")
        vv = vv.replace("שד'", "שדרות ").replace('שד״', "שדרות ").replace("שד ", "שדרות ").replace("שד.", "שדרות ")
        v_more.append(re.sub(r"\s+", " ", vv).strip(" ,;-–—"))
    variants.extend(v_more)

    return _dedupe_keep_order(variants)


def heuristic_spelling_options(
    *,
    street_he: str | None,
    city: str,
    max_items: int = 8,
    trace: TraceLogger | None = None,
) -> tuple[list[str], list[str]]:
    """
    Deterministic fallback when OpenAI is unavailable/errored.

    Focuses on:
    - Removing gershayim/quotes in abbreviations
    - Common address token expansions (רח/שד)
    - A couple of high-signal known typos/abbreviations
    """
    street0 = (street_he or "").strip()
    city0 = (city or "").strip()

    street_variants = _he_basic_variants(street0) if street0 else []
    city_variants = _he_basic_variants(city0) if city0 else []

    # High-signal special cases (avoid overfitting; keep minimal)
    if street0:
        if "קרן קימת לישראל" in street0 or "קרן קיימת לישראל" in street0:
            street_variants = _dedupe_keep_order(
                street_variants
                + [
                    "קרן קיימת לישראל",
                    "קרן קימת לישראל",
                    'קק"ל',
                    "קקל",
                ]
            )

        # Common abbreviation for "התעשייה"
        if "התע" in street0 and ("ש" in street0 or '"' in street0 or "״" in street0):
            street_variants = _dedupe_keep_order(street_variants + ["התעש", "התעשייה"])

    street_variants = street_variants[:max_items]
    city_variants = city_variants[:max_items]

    if trace:
        trace.log("[heuristic] street_variants:")
        for x in street_variants:
            if reverse_for_ltr_console(x) != x:
                trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
            else:
                trace.log(f"  - {x}")
        trace.log("[heuristic] city_variants:")
        for x in city_variants:
            if reverse_for_ltr_console(x) != x:
                trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
            else:
                trace.log(f"  - {x}")

    return (street_variants, city_variants)


def openai_spelling_options(
    *,
    street_he: str | None,
    city: str,
    cache: "JsonCache",
    max_items: int = 8,
    trace: TraceLogger | None = None,
) -> tuple[list[str], list[str]]:
    """
    Use OpenAI to generate spelling variants for street/city when Mapbox fails.
    Returns: (street_variants_he, city_variants)
    - No hardcoded variant lists in code.
    - Results are cached locally to avoid repeat costs.
    """
    street = (street_he or "").strip()
    city0 = (city or "").strip()
    if not city0:
        return ([], [])

    # Versioned cache key so prompt/guardrail changes don't reuse older junk.
    # Versioned cache key so prompt/guardrail changes don't reuse older junk.
    cache_key = f"openai_street_spellings:v1:city={city0}|street={street}"
    cached = cache.get(cache_key)
    if isinstance(cached, dict):
        sv = cached.get("street_variants") if isinstance(cached.get("street_variants"), list) else []
        cv = cached.get("city_variants") if isinstance(cached.get("city_variants"), list) else []
        sv_raw = [str(x).strip() for x in sv if str(x).strip()]
        cv_raw = [str(x).strip() for x in cv if str(x).strip()]
        sv_out, cv_out = _sanitize_openai_variants(
            street_in=street,
            city_in=city0,
            street_variants=sv_raw,
            city_variants=cv_raw,
            max_items=max_items,
        )
        if trace:
            trace.log(f"[openai] cache hit key={cache_key}")
            if len(sv_raw) != len(sv_out) or len(cv_raw) != len(cv_out):
                trace.log(f"[openai] cache sanitized street {len(sv_raw)}-> {len(sv_out)}, city {len(cv_raw)}-> {len(cv_out)}")
            trace.log("[openai] street_variants:")
            for x in sv_out:
                if reverse_for_ltr_console(x) != x:
                    trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
                else:
                    trace.log(f"  - {x}")
            trace.log("[openai] city_variants:")
            for x in cv_out:
                if reverse_for_ltr_console(x) != x:
                    trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
                else:
                    trace.log(f"  - {x}")
        return (sv_out, cv_out)

    api_key = _get_openai_key()
    if not api_key or not OpenAI:
        if trace:
            if not api_key and not OpenAI:
                trace.log("[openai] skipped (missing OPENAI_API_KEY and missing openai package)")
            elif not api_key:
                trace.log("[openai] skipped (missing OPENAI_API_KEY / OPENAI_KEY in environment)")
            else:
                trace.log("[openai] skipped (missing python package: openai)")
        return ([], [])

    model = (os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip() or "gpt-4o-mini"
    system = "Return ONLY valid JSON. No markdown. No explanations."
    user = (
        "Task: Provide orthographic variants for Hebrew street names (Ktiv Maleh/Haser).\n"
        "Rules:\n"
        "- Use Hebrew letters ONLY.\n"
        "- NO Nikud (vowel points), NO digits, NO punctuation.\n"
        "- Focus on adding/removing 'Yod' (י) or 'Vav' (ו) where appropriate.\n"
        "- Do not include the original spelling.\n"
        "- If no valid variant exists, return an empty list.\n\n"
        "Examples:\n"
        "Input: 'המעין' -> Output: ['המעיין']\n"
        "Input: 'ארלוזורוב' -> Output: ['ארלוזרוב']\n"
        "Input: 'דיזנגוף' -> Output: ['דיזינגוף']\n\n"
        f"Return JSON with exactly this key: {{ \"street_variants\": [] }}\n"
        f"Max {max_items} items.\n"
        f"City context: {city0}\n"
        f"Street (Hebrew): {street}"
    )

    try:
        if trace:
            trace.log("[openai] REQUEST")
            trace.log(f"[openai] model={model}")
            trace_block(trace, "[openai] system", system, rtl=False)
            trace_block(trace, "[openai] user", user, rtl=False)
            trace_block(trace, "[openai] user_rtl", user, rtl=True)
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
        )
        text = (resp.choices[0].message.content or "").strip()
        if trace:
            trace.log("[openai] RESPONSE")
            trace_block(trace, "[openai] raw_response", text, rtl=False)
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
        if not isinstance(data, dict):
            return ([], [])
        sv = data.get("street_variants", [])
        if not isinstance(sv, list):
            sv = []
        sv_out = [str(x).strip() for x in sv if str(x).strip()][:max_items]
        cv_out: list[str] = []

        # Dedupe before filtering (OpenAI sometimes repeats items).
        sv_out, cv_out = _sanitize_openai_variants(
            street_in=street,
            city_in=city0,
            street_variants=sv_out,
            city_variants=cv_out,
            max_items=max_items,
        )

        cache.set(cache_key, {"street_variants": sv_out, "city_variants": cv_out})
        if trace:
            trace.log("[openai] parsed street_variants:")
            for x in sv_out:
                if reverse_for_ltr_console(x) != x:
                    trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
                else:
                    trace.log(f"  - {x}")
            trace.log("[openai] parsed city_variants:")
            for x in cv_out:
                if reverse_for_ltr_console(x) != x:
                    trace.log(f"  - {x} | rtl={reverse_for_ltr_console(x)}")
                else:
                    trace.log(f"  - {x}")
        return (sv_out, cv_out)
    except Exception as e:
        if trace:
            trace.log(f"[openai] exception: {type(e).__name__}: {e}")
        return ([], [])


def clean_he_street_house(street: str | None, house: str | None, *, city: str) -> str:
    st = (street or "").strip()
    hs = (house or "").strip()
    city_n = norm_city(city)

    # Normalize common abbreviations/prefixes
    st = st.replace("רח'", "רחוב ").replace('רח״', "רחוב ").replace("רח ", "רחוב ").replace("רח.", "רחוב ")
    st = st.replace("שד'", "שדרות ").replace('שד״', "שדרות ").replace("שד ", "שדרות ").replace("שד.", "שדרות ")

    # Remove noisy tokens if they sneak in
    st = re.sub(r"(?i)סמל\s*מעון.*$", "", st).strip()
    st = re.sub(r"\s+", " ", st).strip(" ,;-–—")

    # Some gov rows use street=city as a placeholder (e.g. street "גבעתיים", house "43").
    # Treat that as "missing street" so we don't produce misleading queries like "גבעתיים 43".
    if norm_city(st) == city_n:
        st = ""

    addr = f"{st} {hs}".strip()
    addr = re.sub(r"\s+", " ", addr).strip(" ,;-–—")
    return addr


def is_insufficient_address(addr: str, *, city: str) -> bool:
    """
    Return True for address strings that are unlikely to be geocoded accurately.
    Examples:
    - Only a house number (e.g. "43")
    - City-only / placeholder-like values
    """
    a = (addr or "").strip()
    if len(a) < 3:
        return True
    # If it's just digits (optionally with a single Hebrew/Latin letter suffix), it's not a real street address.
    if re.fullmatch(r"\d{1,5}[A-Za-z\u05d0-\u05ea]?", a):
        return True
    # "43, גבעתיים" or "גבעתיים 43" style placeholders
    cn = norm_city(city)
    if re.fullmatch(rf"\d{{1,5}}\s*,\s*{re.escape(cn)}", norm_city(a)):
        return True
    if re.fullmatch(rf"{re.escape(cn)}\s+\d{{1,5}}", norm_city(a)):
        return True
    if norm_city(a) == norm_city(city):
        return True
    return False


def iter_local_csv_records(path: Path) -> Iterable[dict[str, Any]]:
    """
    Iterate records from a local CSV downloaded from data.gov.il.
    The file is expected to have Hebrew headers like "שם עיר", "שם רחוב", etc.
    """
    # data.gov.il downloads are typically UTF-8; use sig to handle BOM.
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not isinstance(row, dict):
                continue
            # Normalize: strip whitespace from keys/values
            out: dict[str, Any] = {}
            for k, v in row.items():
                kk = (k or "").strip()
                if isinstance(v, str):
                    out[kk] = v.strip()
                else:
                    out[kk] = v
            yield out


def stable_id_from_semel(semel: str) -> uuid.UUID:
    return uuid.uuid5(ID_NAMESPACE, f"gov:maon_symbol:{semel.strip()}")


def stable_id_fallback(*parts: str) -> uuid.UUID:
    raw = "|".join([p.strip() for p in parts if p and p.strip()])
    return uuid.uuid5(ID_NAMESPACE, f"gov:maon_symbol:fallback:{raw}")


def _s(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _is_phone_value(v: Any) -> bool:
    s = _s(v)
    return bool(s) and s not in ("אין", "0")


def _street_quality(street: str, *, city: str) -> int:
    st = norm_city(street)
    c = norm_city(city)
    if not st:
        return 0
    if st == c:
        return 0
    if re.fullmatch(r"\d{1,5}", st):
        return 0
    return 2


def _address_quality(street: str, house: str, *, city: str) -> int:
    q = _street_quality(street, city=city)
    if _s(house):
        q += 1
    return q


def aggregate_gov_rows(rows: list[dict[str, Any]], *, city: str) -> dict[str, Any]:
    """
    Merge multiple gov rows for the same daycare (same semel).
    Prefer the row with the best street+house combo, then fill missing data
    like phone/manager/status/capacities from the other rows.
    """
    if not rows:
        return {}

    def get_first(rec: dict[str, Any], *keys: str) -> str:
        for k in keys:
            s = _s(rec.get(k))
            if s and s != "אין":
                return s
        return ""

    best = max(
        rows,
        key=lambda r: _address_quality(
            get_first(r, "RECHOV", "שם רחוב", "רחוב"),
            get_first(r, "BAYIT", "מספר בית", "בית"),
            city=city,
        ),
    )
    merged: dict[str, Any] = dict(best)

    for r in rows:
        if not (_is_phone_value(merged.get("מספר טלפון")) or _is_phone_value(merged.get("TELEPHONE")) or _is_phone_value(merged.get("phone"))):
            p = r.get("מספר טלפון") or r.get("TELEPHONE") or r.get("phone")
            if _is_phone_value(p):
                merged["מספר טלפון"] = _s(p)

        if not (_s(merged.get("שם מנהל")) or _s(merged.get("SHEM_MENAHEL")) or _s(merged.get("manager_name"))):
            m = r.get("שם מנהל") or r.get("SHEM_MENAHEL") or r.get("manager_name")
            if _s(m):
                merged["שם מנהל"] = _s(m)

        if not (_s(merged.get("סטטוס רישוי")) or _s(merged.get("STATUS_RISHUI")) or _s(merged.get("license_status"))):
            st = r.get("סטטוס רישוי") or r.get("STATUS_RISHUI") or r.get("license_status")
            if _s(st):
                merged["סטטוס רישוי"] = _s(st)

        for cap_key in ("תפוסת תינוקות", "תפוסת פעוטות", "תפוסת בוגרים"):
            cur = merged.get(cap_key)
            nxt = r.get(cap_key)
            try:
                cur_i = int(str(cur).strip()) if str(cur).strip().isdigit() else None
            except Exception:
                cur_i = None
            try:
                nxt_i = int(str(nxt).strip()) if str(nxt).strip().isdigit() else None
            except Exception:
                nxt_i = None
            if nxt_i is not None and (cur_i is None or nxt_i > cur_i):
                merged[cap_key] = nxt_i

    merged["_raw_rows_count"] = len(rows)
    if len(rows) > 1:
        merged["_raw_samples"] = rows[:2]

    # Track all semel codes we merged (some datasets duplicate a framework under multiple semels).
    semels: set[str] = set()
    for r in rows:
        s = _s(r.get("סמל מעון") or r.get("SEMEL_MAON") or r.get("SEMEL") or r.get("סמל_מעון"))
        if s:
            semels.add(s)
    merged["_semel_codes"] = sorted(semels, key=lambda x: int(x) if x.isdigit() else x)
    # Choose a deterministic "primary" semel so downstream mapping keeps a stable id.
    if merged["_semel_codes"]:
        merged["סמל מעון"] = merged["_semel_codes"][0]
    return merged


def backoff_sleep(attempt: int) -> None:
    base = min(20.0, 2.0 ** attempt)
    jitter = random.uniform(0.0, 0.35)
    time.sleep(base + jitter)


def ckan_fetch_page(
    resource_id: str,
    *,
    q: str | None = None,
    limit: int = 500,
    offset: int = 0,
    timeout_s: int = 25,
) -> dict[str, Any]:
    params: dict[str, Any] = {"resource_id": resource_id, "limit": limit, "offset": offset}
    if q:
        params["q"] = q
    last_err: Exception | None = None
    for attempt in range(0, 6):
        try:
            resp = requests.get(API_URL, params=params, timeout=timeout_s)
            if resp.status_code == 404:
                # Usually means: resource_id no longer exists (yearly refresh) OR endpoint path changed.
                raise RuntimeError(f"CKAN 404 (resource_id={resource_id})")
            if resp.status_code in (429, 500, 502, 503, 504):
                backoff_sleep(attempt)
                continue
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or not data.get("success"):
                raise RuntimeError(f"Unexpected CKAN response: success={data.get('success') if isinstance(data, dict) else None}")
            return data
        except Exception as e:
            last_err = e
            backoff_sleep(attempt)
    raise RuntimeError(f"CKAN fetch failed after retries (offset={offset}): {last_err}")


def ckan_action(url: str, *, params: dict[str, Any], timeout_s: int = 25) -> dict[str, Any]:
    last_err: Exception | None = None
    for attempt in range(0, 6):
        try:
            resp = requests.get(url, params=params, timeout=timeout_s)
            if resp.status_code == 404:
                raise RuntimeError(f"CKAN 404 for {url}")
            if resp.status_code in (429, 500, 502, 503, 504):
                backoff_sleep(attempt)
                continue
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict) or not data.get("success"):
                raise RuntimeError("Unexpected CKAN response (success=false)")
            return data
        except Exception as e:
            last_err = e
            backoff_sleep(attempt)
    raise RuntimeError(f"CKAN action failed after retries: {last_err}")


def resolve_resource_id_for_maon() -> str | None:
    """
    Attempt to find a current resource_id when the hardcoded one expires.
    We search CKAN packages and select a datastore-active resource that
    appears to contain the expected daycare fields.
    """
    pkg_url = "https://data.gov.il/api/3/action/package_search"
    # Hebrew query usually works best; keep it broad.
    data = ckan_action(pkg_url, params={"q": "מעונות יום", "rows": 10})
    result = data.get("result")
    if not isinstance(result, dict):
        return None
    results = result.get("results")
    if not isinstance(results, list):
        return None

    def looks_like_maon_fields(fields: list[dict[str, Any]]) -> bool:
        names = {str(f.get("id") or "") for f in fields if isinstance(f, dict)}
        # Accept either the older ALL-CAPS schema or the Hebrew-field schema.
        return (
            (("SEMEL_MAON" in names or "SEMEL" in names) and ("SHEM_MAON" in names))
            or (("סמל מעון" in names) and ("שם מעון" in names))
        )

    ds_url = "https://data.gov.il/api/3/action/datastore_search"
    # Probe candidate resources quickly by fetching fields metadata (limit=0)
    for pkg in results:
        if not isinstance(pkg, dict):
            continue
        resources = pkg.get("resources")
        if not isinstance(resources, list):
            continue
        for r in resources[:30]:
            if not isinstance(r, dict):
                continue
            if not r.get("datastore_active"):
                continue
            rid = r.get("id")
            if not isinstance(rid, str) or not rid.strip():
                continue
            try:
                probe = ckan_action(ds_url, params={"resource_id": rid, "limit": 0})
                pres = probe.get("result")
                if not isinstance(pres, dict):
                    continue
                fields = pres.get("fields")
                if isinstance(fields, list) and looks_like_maon_fields(fields):
                    return rid
            except Exception:
                continue
    return None


def pick_record_city(rec: dict[str, Any]) -> str | None:
    # Try common field names seen in gov datasets
    for k in ("SHEM_YISHUV", "SHEM_YISHUV_HE", "YISHUV", "CITY", "CITY_NAME", "יישוב", "עיר", "שם עיר"):
        v = rec.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def iter_aggregated_records(
    rec_iter: Iterable[dict[str, Any]],
    *,
    city: str,
    city_norm: str,
    all_cities: bool = False,
) -> Iterable[dict[str, Any]]:
    """
    Group rows by semel maon (preferred) and aggregate duplicates.
    This solves cases where one row has a good street and another has a phone, etc.
    """
    groups: dict[str, list[dict[str, Any]]] = {}
    order: list[str] = []
    for rec in rec_iter:
        rec_city = pick_record_city(rec) or ""
        if not all_cities and rec_city and norm_city(rec_city) != city_norm:
            continue
        # Cluster key (more aggressive than semel-only):
        # If gov publishes multiple rows that represent the same real-world gan
        # (e.g. one row has the phone, another has the real street),
        # we merge by (city, name, house, type_desc).
        name = _s(rec.get("שם מעון") or rec.get("SHEM_MAON") or rec.get("name"))
        house = _s(rec.get("מספר בית") or rec.get("BAYIT") or rec.get("בית"))
        type_desc = _s(rec.get("תיאור סוג מעון") or rec.get("maon_type_desc"))
        rec_city_norm = norm_city(rec_city) if all_cities else city_norm
        key = f"cluster:{rec_city_norm}|{norm_city(name)}|{house}|{norm_city(type_desc)}"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(rec)

    for key in order:
        rows = groups[key]
        if len(rows) == 1:
            yield rows[0]
        else:
            merge_city = pick_record_city(rows[0]) or city
            yield aggregate_gov_rows(rows, city=merge_city)


@dataclass(frozen=True)
class MapboxResult:
    lat: float
    lon: float
    place_name: str


def mapbox_geocode(
    query: str,
    token: str,
    *,
    proximity: tuple[float, float] | None,
    required_city_variants: list[str] | None,
    trace: TraceLogger | None = None,
) -> MapboxResult | None:
    url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(query)}.json"
    params: dict[str, str] = {
        "access_token": token,
        "country": "il",
        "language": "he",
        "limit": "5",
        "types": "address,poi",
    }
    if proximity:
        lat, lon = proximity
        params["proximity"] = f"{lon},{lat}"
    resp = requests.get(url, params=params, timeout=25)
    if resp.status_code >= 400:
        if trace:
            trace.log(f"[mapbox] HTTP {resp.status_code} for query={query!r}")
        return None
    data = resp.json()
    features = data.get("features") if isinstance(data, dict) else None
    if not isinstance(features, list) or not features:
        if trace:
            trace.log(f"[mapbox] no features for query={query!r}")
        return None

    candidates: list[MapboxResult] = []
    for f in features:
        if not isinstance(f, dict):
            continue
        center = f.get("center")
        if not (isinstance(center, list) and len(center) >= 2):
            continue
        try:
            lon = float(center[0])
            lat = float(center[1])
        except Exception:
            continue
        if not (lat == lat and lon == lon):
            continue
        place_name = str(f.get("place_name") or "")
        candidates.append(MapboxResult(lat=lat, lon=lon, place_name=place_name))

    if not candidates:
        if trace:
            trace.log(f"[mapbox] no usable candidates for query={query!r}")
        return None

    if required_city_variants:
        if trace:
            trace.log(f"[mapbox] candidates ({len(candidates)}) for query={query!r}:")
            for i, c in enumerate(candidates[:5]):
                trace.log(f"  - {i+1}. {c.place_name} @ ({c.lat:.6f},{c.lon:.6f})")
            trace.log(f"[mapbox] required_city_variants={required_city_variants}")
        for c in candidates:
            if contains_any(c.place_name, required_city_variants):
                if trace:
                    trace.log(f"[mapbox] accepted: {c.place_name}")
                return c
        if trace:
            trace.log("[mapbox] rejected all candidates (city mismatch)")
        return None

    if trace:
        trace.log(f"[mapbox] accepted first candidate (no city constraint): {candidates[0].place_name}")
    return candidates[0]


class JsonCache:
    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, Any] = {}
        self._dirty = False

    def load(self) -> None:
        try:
            if self.path.exists():
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            self.data = {}

    def get(self, key: str) -> Any | None:
        return self.data.get(key)

    def set(self, key: str, value: Any) -> None:
        self.data[key] = value
        self._dirty = True

    def flush(self) -> None:
        if not self._dirty:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)
        self._dirty = False


def iter_ckan_records_for_city(resource_id: str, city: str, *, page_limit: int = 500) -> Iterable[dict[str, Any]]:
    offset = 0
    total: int | None = None
    while True:
        page = ckan_fetch_page(resource_id, q=city or None, limit=page_limit, offset=offset)
        result = page.get("result") if isinstance(page, dict) else None
        if not isinstance(result, dict):
            break
        if total is None:
            t = result.get("total")
            total = int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
        records = result.get("records")
        if not isinstance(records, list) or not records:
            break
        for r in records:
            if isinstance(r, dict):
                yield r
        offset += page_limit
        if total is not None and offset >= total:
            break


def ckan_get_total(resource_id: str, *, q: str | None = None) -> int | None:
    """Fetch total record count from the API (one lightweight request)."""
    try:
        page = ckan_fetch_page(resource_id, q=q, limit=1, offset=0)
        result = page.get("result") if isinstance(page, dict) else None
        if isinstance(result, dict):
            t = result.get("total")
            return int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
    except Exception:
        pass
    return None


def iter_ckan_records_all(resource_id: str, *, page_limit: int = 500) -> Iterable[dict[str, Any]]:
    """Fetch all records from the resource (no city filter)."""
    offset = 0
    total: int | None = None
    while True:
        page = ckan_fetch_page(resource_id, q=None, limit=page_limit, offset=offset)
        result = page.get("result") if isinstance(page, dict) else None
        if not isinstance(result, dict):
            break
        if total is None:
            t = result.get("total")
            total = int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
        records = result.get("records")
        if not isinstance(records, list) or not records:
            break
        for r in records:
            if isinstance(r, dict):
                yield r
        offset += page_limit
        if total is not None and offset >= total:
            break


REPORT_COLUMNS = [
    "id",
    "semel_maon",
    "name_he",
    "city",
    "address",
    "query",
    "geocode_status",
    "lat",
    "lon",
    "place_name",
    "action",
    "reason",
]


def main() -> int:
    load_env()

    ap = argparse.ArgumentParser(description="Import maon symbol daycares from data.gov.il into ganim_v2")
    ap.add_argument("--city", default=None, help='City/municipality name in Hebrew, e.g. "גבעתיים"')
    ap.add_argument("--all-cities", action="store_true", help="Process all cities (omit city filter; requires API, not input-csv)")
    ap.add_argument("--resource-id", default=env_trim("DATAGOVIL_MAON_RESOURCE_ID") or DEFAULT_RESOURCE_ID)
    ap.add_argument("--input-csv", default=None, help="Use a local data.gov.il CSV file instead of calling the API")
    ap.add_argument("--dry-run", action="store_true", help="Do everything except DB writes")
    ap.add_argument("--write", action="store_true", help="Write results to Supabase via RPC (requires service role key)")
    ap.add_argument("--max-records", type=int, default=0, help="Stop after N mapped records (0 = no limit)")
    ap.add_argument("--max-geocodes", type=int, default=50, help="Max Mapbox geocoding calls in this run")
    ap.add_argument("--sleep-ms", type=int, default=140, help="Sleep between Mapbox calls (ms)")
    ap.add_argument("--allow-fallback", action="store_true", help="If geocoding fails, insert using city center coords (marked fallback)")
    ap.add_argument("--no-cache", action="store_true", help="Disable local geocode cache (not recommended)")
    ap.add_argument(
        "--allow-city-mismatch",
        action="store_true",
        help="Allow Mapbox results whose place_name doesn't include the requested city (default: reject)",
    )
    ap.add_argument("--max-openai", type=int, default=3, help="Max OpenAI spelling-variant calls per run")
    ap.add_argument("--trace", action="store_true", help="Verbose trace: log every geocode/OpenAI attempt to terminal + file")
    ap.add_argument("--output-json", action="store_true", help="Also write a ganim_v2-shaped JSON preview (successful rows only)")
    ap.add_argument("--output-table-csv", action="store_true", help="Also write a ganim_v2-shaped table CSV (successful rows only)")
    ap.add_argument("--output-xlsx", action="store_true", help="Also write a ganim_v2-shaped Excel file (successful rows only)")
    ap.add_argument(
        "--dedupe-fuzzy",
        action="store_true",
        help="When writing MAON_SYMBOL, treat as same gan if (same semel) OR (same house number + street/name within 2 edits).",
    )
    args = ap.parse_args()

    if args.write and args.dry_run:
        print("Choose either --dry-run or --write (not both).")
        return 2
    if not args.write and not args.dry_run:
        print("Choose one: --dry-run (recommended first) or --write")
        return 2
    if not args.all_cities and (not args.city or not args.city.strip()):
        print("Provide --city or use --all-cities")
        return 2

    all_cities = bool(args.all_cities)
    city = (args.city or "").strip() if not all_cities else "all"
    city_norm = norm_city(city)
    city_tag = urlquote(city_norm, safe="")

    mapbox_token = require_env_any(["MAPBOX_ACCESS_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"])

    sb = None
    if args.write:
        if create_client is None:
            print("Missing dependency: supabase. Install with scripts/scraper/requirements.txt")
            return 2
        supabase_url = require_env_any(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"])
        supabase_key = require_env_any(
            [
                "SUPABASE_SERVICE_ROLE_KEY",
                "SUPABASE_SERVICE_ROLE",
                "SUPABASE_SERVICE_ROLE_SECRET",
                "SUPABASE_SERVICE_KEY",
            ]
        )
        sb = create_client(supabase_url, supabase_key)
        # Fail fast if the RPC isn't deployed / schema cache isn't refreshed.
        try:
            ensure_upsert_ganim_v2_rpc_available(sb)
        except Exception as e:
            print(f"ERROR: {e}")
            return 2

    # Cache
    cache = JsonCache(repo_root() / ".cache" / "gov_import" / "mapbox_geocode_il.json")
    if not args.no_cache:
        cache.load()

    spellings_cache = JsonCache(repo_root() / ".cache" / "gov_import" / "openai_spellings.json")
    spellings_cache.load()

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = repo_root() / "scripts" / "gov_import" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv = out_dir / f"import_maon_symbol_{city_tag}_{'dryrun' if args.dry_run else 'write'}_{ts}.csv"
    trace_log_path = out_dir / f"import_maon_symbol_{city_tag}_{'dryrun' if args.dry_run else 'write'}_{ts}.trace.log"
    out_json = out_dir / f"import_maon_symbol_{city_tag}_{'dryrun' if args.dry_run else 'write'}_{ts}.ganim_v2.json"
    out_table_csv = out_dir / f"import_maon_symbol_{city_tag}_{'dryrun' if args.dry_run else 'write'}_{ts}.ganim_v2.table.csv"
    out_xlsx = out_dir / f"import_maon_symbol_{city_tag}_{'dryrun' if args.dry_run else 'write'}_{ts}.ganim_v2.xlsx"
    trace = TraceLogger(enabled=bool(args.trace), path=trace_log_path if args.trace else None)

    total_seen = 0
    total_mapped = 0
    geocode_calls = 0
    geocode_ok = 0
    geocode_cached = 0
    skipped_geocode = 0
    geocode_cap_hits = 0
    openai_calls = 0
    inserted = 0
    skipped_city_mismatch = 0
    json_preview_rows: list[dict[str, Any]] = []

    # Optional: preload existing MAON_SYMBOL rows for fuzzy de-dupe in write mode.
    existing_by_house: dict[str, list[dict[str, str]]] = {}
    if args.write and args.dedupe_fuzzy:
        assert sb is not None
        try:
            q = sb.table("ganim_v2").select("id,name_he,address,city,category,maon_symbol_code").eq("category", "MAON_SYMBOL")
            if not all_cities:
                q = q.eq("city", city)
            res = q.limit(50000).execute()
            rows = res.data if hasattr(res, "data") else None
            if isinstance(rows, list):
                for r in rows:
                    if not isinstance(r, dict):
                        continue
                    addr = str(r.get("address") or "")
                    name = str(r.get("name_he") or "")
                    rid = str(r.get("id") or "").strip()
                    sem = str(r.get("maon_symbol_code") or "").strip()
                    street_n, house_n = parse_street_house_from_address(addr)
                    if not house_n or not rid:
                        continue
                    existing_by_house.setdefault(house_n, []).append(
                        {
                            "id": rid,
                            "name_n": _norm_he_simple(name),
                            "street_n": _norm_he_simple(street_n),
                            "maon_symbol_code": sem,
                        }
                    )
        except Exception:
            existing_by_house = {}

    # Proximity for Mapbox: per-record when all_cities, else single city.
    base_proximity = None if all_cities else (CITY_CENTERS.get(city) or CITY_CENTERS.get(city_norm))

    # Keep a stable, learned city-accept list for place_name validation.
    # Once we accept a Mapbox result, we learn the city string used by Mapbox and
    # reuse it for the rest of this run (prevents oscillating city variants).
    # When all_cities, we reset per record.
    city_accept_variants: list[str] = [] if all_cities else _dedupe_keep_order([city])
    city_accept_locked = False
    # City query overrides (hebrew city -> english/translit city) learned during the run.
    city_query_override: dict[str, str] = {}
    city_openai_attempted: set[str] = set()

    # Use ASCII-only output to avoid Windows console encoding issues.
    print(f"=== data.gov.il -> ganim_v2 ({'DRY RUN' if args.dry_run else 'WRITE'}) ===")
    resource_id = args.resource_id
    resolved_from: str | None = None
    use_local = bool(args.input_csv)

    if use_local:
        if all_cities:
            print("Note: --all-cities with --input-csv processes all records in the file (no city filter).")
        in_path = Path(args.input_csv)
        if not in_path.exists():
            print(f"ERROR: input CSV not found: {in_path}")
            return 1
        print(f"City: {city} | input_csv: {in_path}")
    else:
        # If the configured resource_id expired, try to auto-resolve a current one.
        ckan_q = None if all_cities else city
        try:
            _ = ckan_fetch_page(resource_id, q=ckan_q, limit=1, offset=0)
        except Exception as e:
            msg = str(e)
            if "CKAN 404" in msg:
                resolved = resolve_resource_id_for_maon()
                if resolved:
                    resource_id = resolved
                    resolved_from = args.resource_id
            # else: keep failing later with the original error details

        # Validate resource_id before creating an output file (prevents header-only CSVs on failure).
        try:
            _ = ckan_fetch_page(resource_id, q=ckan_q, limit=1, offset=0)
        except Exception as e:
            print(f"ERROR: data.gov.il fetch failed for resource_id={resource_id}: {e}")
            return 1

        if resolved_from:
            print(f"City: {city} | resource_id: {resource_id} (resolved from {resolved_from})")
        else:
            print(f"City: {city} | resource_id: {resource_id}")
    print(f"Geocoding: Mapbox (max calls: {args.max_geocodes}, cache: {'off' if args.no_cache else 'on'})")
    print(f"Fallback: {'allowed' if args.allow_fallback else 'SKIP (default)'}")
    print(f"Output: {out_csv}")
    if args.trace:
        print(f"Trace log: {trace_log_path}")
    if args.output_json:
        print(f"JSON preview: {out_json}")
    if args.output_table_csv:
        print(f"Table CSV: {out_table_csv}")
    if args.output_xlsx:
        print(f"Excel: {out_xlsx}")
    print()

    with open(out_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=REPORT_COLUMNS)
        w.writeheader()

        try:
            if use_local:
                rec_iter = iter_local_csv_records(Path(args.input_csv))
                total_expected: int | None = None
                try:
                    with open(args.input_csv, "r", encoding="utf-8-sig", newline="") as cf:
                        total_expected = sum(1 for _ in cf) - 1  # minus header
                except Exception:
                    pass
            else:
                rec_iter = iter_ckan_records_all(resource_id) if all_cities else iter_ckan_records_for_city(resource_id, city)
                ckan_q = None if all_cities else city
                total_expected = ckan_get_total(resource_id, q=ckan_q)

            # Aggregate duplicates (e.g. same semel appears in multiple rows).
            rec_iter = iter_aggregated_records(rec_iter, city=city, city_norm=city_norm, all_cities=all_cities)

            if total_expected is not None:
                print(f"Total records to process: {total_expected}")

            for rec in rec_iter:
                total_seen += 1
                if args.trace:
                    trace.log("\n" + "=" * 80)
                    trace.log(f"[row] #{total_seen}")

                # Strict city filter when dataset provides a city field
                rec_city = pick_record_city(rec)
                if rec_city:
                    if not all_cities and norm_city(rec_city) != city_norm:
                        skipped_city_mismatch += 1
                        continue
                if all_cities:
                    city = rec_city or "UNKNOWN"
                    city_norm = norm_city(city)
                    city_accept_variants = _dedupe_keep_order([city])
                    city_accept_locked = False
                    proximity = CITY_CENTERS.get(city) or CITY_CENTERS.get(city_norm)
                else:
                    proximity = base_proximity

                name_he = (
                    rec.get("SHEM_MAON")
                    or rec.get("שם מעון")
                    or rec.get("שם_מעון")
                    or rec.get("name")
                    or ""
                ).strip()
                street = rec.get("RECHOV") or rec.get("שם רחוב") or rec.get("רחוב")
                house = rec.get("BAYIT") or rec.get("מספר בית") or rec.get("בית")
                semel = str(
                    rec.get("SEMEL_MAON")
                    or rec.get("SEMEL")
                    or rec.get("סמל מעון")
                    or rec.get("סמל_מעון")
                    or ""
                ).strip()

                phone = rec.get("TELEPHONE") or rec.get("מספר טלפון") or rec.get("phone")
                manager_name = rec.get("SHEM_MENAHEL") or rec.get("שם מנהל") or rec.get("manager_name")
                raw_status = rec.get("STATUS_RISHUI") or rec.get("סטטוס רישוי") or rec.get("license_status")
                maon_type_desc = rec.get("תיאור סוג מעון") or rec.get("maon_type_desc")
                maon_type_code = rec.get("קוד סוג מעון") or rec.get("maon_type_code")

                if not name_he:
                    name_he = "שם לא ידוע"

                # Store address as street+house only; city is a separate column.
                address = clean_he_street_house(str(street or ""), str(house or ""), city=city)
                if len(address.strip()) < 3:
                    address = ""

                # Deterministic identity:
                # - If SEMEL exists: stable id from SEMEL (best key)
                # - Else: stable id from (city, name, street+house) so reruns don't duplicate.
                if semel:
                    rid = stable_id_from_semel(semel)
                else:
                    rid = stable_id_fallback(city, name_he, address)

                # Build a geocode query (prefer address+city; fallback to name+city).
                if address:
                    query = f"{address}, {city}".strip(" ,")
                else:
                    query = f"{name_he}, {city}".strip(" ,")
                query = re.sub(r"\s+", " ", query).strip(" ,")
                if args.trace:
                    trace.log(f"[row] semel={semel!r}")
                    trace_kv(trace, "[row] name_he", name_he)
                    trace_kv(trace, "[row] street", str(street or "").strip())
                    trace_kv(trace, "[row] house", str(house or "").strip())
                    trace_kv(trace, "[row] city", city)
                    trace_kv(trace, "[row] address", address)
                    trace_kv(trace, "[row] query", query)

                # Fuzzy de-dupe in write mode: if (house matches) and (street+name within 2 edits),
                # upsert into the existing row id instead of creating a new deterministic uuid.
                matched_existing_maon_symbol_code: str | None = None
                merged_into_id: str | None = None
                if args.write and args.dedupe_fuzzy and address and semel:
                    street_n, house_n = parse_street_house_from_address(address)
                    name_n = _norm_he_simple(name_he)
                    if house_n and street_n and name_n:
                        candidates = existing_by_house.get(house_n, [])
                        matched: dict[str, str] | None = None
                        for ex in candidates:
                            # Quick reject on length deltas before DP
                            if not _bounded_edit_distance_leq(street_n, ex.get("street_n", ""), 2):
                                continue
                            if not _bounded_edit_distance_leq(name_n, ex.get("name_n", ""), 2):
                                continue
                            matched = ex
                            break
                        if matched and matched.get("id"):
                            merged_into_id = str(matched["id"])
                            if args.trace:
                                trace.log(
                                    f"[dedupe] fuzzy match: semel={semel!r} -> existing_id={merged_into_id!r} (house={house_n!r})"
                                )
                            # Use existing id for upsert to avoid duplicates
                            try:
                                rid = uuid.UUID(merged_into_id)
                            except Exception:
                                pass
                            ms = (matched.get("maon_symbol_code") or "").strip()
                            matched_existing_maon_symbol_code = ms or None

                # Determine what we'll write:
                # - If we matched an existing MAON_SYMBOL row: keep it MAON_SYMBOL and preserve its primary code
                # - Else if we have semel: MAON_SYMBOL with that code
                # - Else: UNSPECIFIED with no maon_symbol_code (since MAON_SYMBOL requires it)
                write_category = "MAON_SYMBOL" if (matched_existing_maon_symbol_code or semel) else "UNSPECIFIED"
                write_maon_symbol_code = matched_existing_maon_symbol_code or (semel or None)

                # If the dataset already includes coordinates, prefer those (no Mapbox cost).
                gov_lat = rec.get("lat") or rec.get("LAT")
                gov_lon = rec.get("lon") or rec.get("LON")
                have_gov_coords = False
                try:
                    if gov_lat is not None and gov_lon is not None:
                        lat0 = float(gov_lat)
                        lon0 = float(gov_lon)
                        if (lat0 == lat0) and (lon0 == lon0) and abs(lat0) <= 90 and abs(lon0) <= 180:
                            have_gov_coords = True
                            lat = lat0
                            lon = lon0
                except Exception:
                    have_gov_coords = False

                # Geocode (cached)
                geo_status = ""
                if not have_gov_coords:
                    lat = ""
                    lon = ""
                place_name = ""
                is_fallback = False
                reason = ""

                if have_gov_coords:
                    geo_status = "gov_coords"
                    if args.trace:
                        trace.log(f"[geo] using gov coords: ({lat},{lon})")
                else:
                    # If we have no street/house, allow name-based geocode; only skip if the query itself is insufficient.
                    if is_insufficient_address(query, city=city) and (not address or is_insufficient_address(address, city=city)):
                        geo_status = "insufficient_address"
                        reason = "missing/placeholder street (e.g. city+house-number only)"
                        # Do not attempt Mapbox for obviously-bad addresses.
                        skipped_geocode += 1
                    else:
                        def city_variants_for_check() -> list[str]:
                            return list(city_accept_variants)

                        def accept_place(place: str, city_variants: list[str]) -> bool:
                            return args.allow_city_mismatch or contains_any(place, city_variants)

                        attempted_mapbox: set[str] = set()

                        def learn_city_from_place(place: str) -> None:
                            nonlocal city_accept_locked, city_accept_variants
                            if not place or args.allow_city_mismatch:
                                return
                            learned = extract_city_from_place_name(place)
                            if not learned:
                                return
                            city_accept_variants = _dedupe_keep_order(city_accept_variants + [learned])
                            city_accept_locked = True

                        def normalize_query(q: str) -> str:
                            return re.sub(r"\s+", " ", (q or "").strip(" ,"))

                        def try_cached(q: str, city_variants: list[str]) -> bool:
                            if args.no_cache:
                                return False
                            c = cache.get(q)
                            if not (isinstance(c, dict) and "lat" in c and "lon" in c):
                                if args.trace:
                                    trace.log(f"[geo] cache miss q={q!r}")
                                return False
                            p = str(c.get("place_name") or "")
                            if p and not accept_place(p, city_variants):
                                if args.trace:
                                    trace.log(f"[geo] cache reject (city mismatch) q={q!r} place_name={p!r}")
                                return False
                            nonlocal lat, lon, place_name, geo_status, reason
                            lat = c.get("lat", "")
                            lon = c.get("lon", "")
                            place_name = p
                            geo_status = "cached"
                            if args.trace:
                                trace.log(f"[geo] cache hit q={q!r} place_name={p!r}")
                            learn_city_from_place(p)
                            return True

                        def try_mapbox(q: str, city_variants: list[str]) -> bool:
                            nonlocal geocode_calls, geo_status, reason, lat, lon, place_name
                            qq = normalize_query(q)
                            if not qq:
                                return False
                            if qq in attempted_mapbox:
                                if args.trace:
                                    trace.log(f"[geo] skip duplicate (mapbox) q={q!r}")
                                return False
                            if geocode_calls >= args.max_geocodes:
                                nonlocal geocode_cap_hits
                                geocode_cap_hits += 1
                                geo_status = "geocode_cap"
                                reason = f"max_geocodes reached ({args.max_geocodes})"
                                if args.trace:
                                    trace.log(f"[geo] mapbox cap reached ({geocode_calls}/{args.max_geocodes}); stopping Mapbox tries")
                                return False
                            attempted_mapbox.add(qq)
                            geocode_calls += 1
                            if args.trace:
                                trace.log(f"[geo] mapbox try ({geocode_calls}/{args.max_geocodes}) q={q!r}")
                            r = mapbox_geocode(
                                q,
                                mapbox_token,
                                proximity=proximity,
                                required_city_variants=None if args.allow_city_mismatch else city_variants,
                                trace=trace if args.trace else None,
                            )
                            time.sleep(max(0.0, args.sleep_ms / 1000.0))
                            if not r:
                                if args.trace:
                                    trace.log(f"[geo] mapbox no match q={q!r}")
                                return False
                            if not accept_place(r.place_name, city_variants):
                                if args.trace:
                                    trace.log(f"[geo] mapbox reject (city mismatch) q={q!r} place_name={r.place_name!r}")
                                return False
                            geo_status = "ok"
                            lat = r.lat
                            lon = r.lon
                            place_name = r.place_name
                            learn_city_from_place(r.place_name)
                            if not args.no_cache:
                                cache.set(q, {"lat": r.lat, "lon": r.lon, "place_name": r.place_name, "ts": now_utc_iso()})
                                cache.set(query, {"lat": r.lat, "lon": r.lon, "place_name": r.place_name, "ts": now_utc_iso()})
                            return True

                        base_city_variants = city_variants_for_check()
                        if args.trace:
                            trace.log(f"[geo] base_city_variants={base_city_variants}")

                        # 1) First attempt: cache, then Mapbox, using strict city check.
                        if try_cached(query, base_city_variants):
                            geocode_cached += 1
                            if args.trace:
                                trace.log("[geo] cache hit for base query")
                        elif try_mapbox(query, base_city_variants):
                            geocode_ok += 1
                            if args.trace:
                                trace.log("[geo] mapbox success for base query")
                        else:
                            # 2) Fallback: OpenAI-generated spelling variants, then sequential Mapbox tries until first success.
                            street_variants: list[str] = []

                            if openai_calls < args.max_openai:
                                openai_calls += 1
                                street_variants, _ = openai_spelling_options(
                                    street_he=str(street or "").strip(),
                                    city=city,
                                    cache=spellings_cache,
                                    max_items=8,
                                    trace=trace if args.trace else None,
                                )
                            else:
                                if args.trace:
                                    trace.log("[openai] skipped (max-openai reached)")

                            # If OpenAI returned nothing (quota, missing key, parse error, etc),
                            # fall back to deterministic heuristic variants so we still expand the search.
                            if not street_variants:
                                if args.trace:
                                    trace.log("[openai] no variants returned; using heuristic variants")
                                h_street, _h_city = heuristic_spelling_options(
                                    street_he=str(street or "").strip(),
                                    city=city,
                                    max_items=8,
                                    trace=trace if args.trace else None,
                                )
                                street_variants = h_street
                            else:
                                # Even when OpenAI succeeds, add heuristic normalizations to catch
                                # punctuation/quote variants without spending another Mapbox call.
                                h_street, _h_city = heuristic_spelling_options(
                                    street_he=str(street or "").strip(),
                                    city=city,
                                    max_items=8,
                                    trace=None,
                                )
                                street_variants = _dedupe_keep_order(street_variants + h_street)[:8]

                            expanded_city_variants = list(city_accept_variants)

                            # If the city hasn't worked yet, we may choose a transliteration for the query string.
                            query_city = city
                            if not city_accept_locked:
                                query_city = city_query_override.get(city, city)

                            # Build candidate queries from street variants only (city stays fixed once it works).
                            street_base = str(street or "").strip()
                            house_s = str(house or "").strip()

                            candidates: list[str] = []
                            seen_q: set[str] = set()

                            def add_q(q: str) -> None:
                                qq = re.sub(r"\s+", " ", (q or "").strip(" ,"))
                                if not qq or qq in seen_q:
                                    return
                                seen_q.add(qq)
                                candidates.append(qq)

                            add_q(query)
                            for sv in ([street_base] + street_variants)[:12]:
                                    if not sv:
                                        continue

                                    sv_norm = re.sub(r"\s+", " ", sv).strip()
                                    house_norm = re.sub(r"\s+", " ", house_s).strip()

                                    if house_s:
                                        # Avoid generating nonsense like "המעין 2 1" when OpenAI mistakenly returns
                                        # variants containing a house number or other digits.
                                        if house_norm and house_norm in sv_norm:
                                            # Variant already includes the house token.
                                            add_q(f"{sv}, {query_city}")
                                        elif sv_norm != street_base and re.search(r"\d", sv_norm):
                                            # Variant contains digits (likely a house number) - don't append ours.
                                            add_q(f"{sv}, {query_city}")
                                        else:
                                            add_q(f"{sv} {house_s}, {query_city}")
                                            # Try without house number too (Mapbox often has street-only POIs/segments).
                                            add_q(f"{sv}, {query_city}")
                                    else:
                                        add_q(f"{sv}, {query_city}")
                                    if len(candidates) >= 20:
                                        break

                            if args.trace:
                                trace.log(f"[geo] candidate_queries ({len(candidates)}):")
                                for i, qv in enumerate(candidates, start=1):
                                    if reverse_for_ltr_console(qv) != qv:
                                        trace.log(f"  {i:02d}. {qv} | rtl={reverse_for_ltr_console(qv)}")
                                    else:
                                        trace.log(f"  {i:02d}. {qv}")

                            success = False
                            for qv in candidates:
                                if args.trace:
                                    trace.log(f"[geo] try candidate={qv!r}")
                                if try_cached(qv, expanded_city_variants):
                                    geocode_cached += 1
                                    reason = f"used_variant={qv}"
                                    success = True
                                    if args.trace:
                                        trace.log(f"[geo] cache success with candidate={qv!r}")
                                    break
                                if try_mapbox(qv, expanded_city_variants):
                                    geocode_ok += 1
                                    reason = f"used_variant={qv}"
                                    success = True
                                    if args.trace:
                                        trace.log(f"[geo] mapbox success with candidate={qv!r}")
                                    break
                                # keep going until success or exhaustion
                                if geo_status == "geocode_cap":
                                    # stop immediately if we hit the hard cap
                                    if args.trace:
                                        trace.log("[geo] stopping variant tries (geocode cap reached)")
                                    break

                            # 3) Rare fallback: if street variants didn't help AND the city hasn't worked yet,
                            # try an English/translit city name (cached per city) to influence Mapbox matching.
                            if (not success) and (geo_status not in ("geocode_cap",)) and (not city_accept_locked):
                                if city not in city_openai_attempted and city not in city_query_override:
                                    city_openai_attempted.add(city)
                                    if openai_calls < args.max_openai:
                                        openai_calls += 1
                                        city_opts = openai_city_transliteration_options(
                                            city=city,
                                            cache=spellings_cache,
                                            max_items=4,
                                            trace=trace if args.trace else None,
                                        )
                                    else:
                                        city_opts = []
                                        if args.trace:
                                            trace.log("[openai_city] skipped (max-openai reached)")

                                    # Try each city option until first success; then pin it for subsequent attempts.
                                    for cv in city_opts:
                                        if args.trace:
                                            trace.log(f"[geo] trying city override for query: {city!r} -> {cv!r}")
                                        city_query_override[city] = cv
                                        # rebuild a small candidate set with this override (bounded)
                                        local_candidates: list[str] = []
                                        local_seen: set[str] = set()

                                        def add_local(q: str) -> None:
                                            qq = re.sub(r"\s+", " ", (q or "").strip(" ,"))
                                            if not qq or qq in local_seen:
                                                return
                                            local_seen.add(qq)
                                            local_candidates.append(qq)

                                        # Try base street + up to 5 street variants with this city override
                                        for sv in ([street_base] + street_variants)[:6]:
                                            if not sv:
                                                continue
                                            if house_s:
                                                add_local(f"{sv} {house_s}, {cv}")
                                            add_local(f"{sv}, {cv}")
                                            if len(local_candidates) >= 12:
                                                break

                                        if args.trace:
                                            trace.log(f"[geo] city-override candidate_queries ({len(local_candidates)}):")
                                            for i, qv2 in enumerate(local_candidates, start=1):
                                                if reverse_for_ltr_console(qv2) != qv2:
                                                    trace.log(f"  {i:02d}. {qv2} | rtl={reverse_for_ltr_console(qv2)}")
                                                else:
                                                    trace.log(f"  {i:02d}. {qv2}")

                                        for qv2 in local_candidates:
                                            if try_cached(qv2, expanded_city_variants):
                                                geocode_cached += 1
                                                reason = f"used_city_override={cv}; used_variant={qv2}"
                                                success = True
                                                if args.trace:
                                                    trace.log(f"[geo] cache success with city override candidate={qv2!r}")
                                                break
                                            if try_mapbox(qv2, expanded_city_variants):
                                                geocode_ok += 1
                                                reason = f"used_city_override={cv}; used_variant={qv2}"
                                                success = True
                                                if args.trace:
                                                    trace.log(f"[geo] mapbox success with city override candidate={qv2!r}")
                                                break
                                            if geo_status == "geocode_cap":
                                                if args.trace:
                                                    trace.log("[geo] stopping city-override tries (geocode cap reached)")
                                                break
                                        if success or geo_status == "geocode_cap":
                                            break
                                # If we succeeded with a city override, we consider the city "worked" and stop
                                # trying additional city changes; accept-place learning will lock it.

                            if not success and geo_status not in ("geocode_cap",):
                                geo_status = "no_result"
                                reason = "No acceptable Mapbox result (after OpenAI variants)"
                                if args.trace:
                                    trace.log("[geo] no acceptable Mapbox result after OpenAI variants")

                action = "skip"
                if geo_status in ("ok", "cached"):
                    action = "would_upsert" if args.dry_run else "upserted"
                else:
                    if args.allow_fallback and proximity:
                        # Use city center fallback only when explicitly allowed
                        is_fallback = True
                        lat = float(proximity[0])
                        lon = float(proximity[1])
                        place_name = ""
                        action = "would_upsert_fallback" if args.dry_run else "upserted_fallback"
                        geo_status = f"{geo_status}+fallback"
                    else:
                        action = "skip"

                # Stop conditions
                if args.max_records and total_mapped >= args.max_records:
                    break

                total_mapped += 1

                raw_rows_count = rec.get("_raw_rows_count")
                raw_samples = rec.get("_raw_samples")
                semel_codes = rec.get("_semel_codes")
                raw_for_metadata = dict(rec)
                raw_for_metadata.pop("_raw_rows_count", None)
                raw_for_metadata.pop("_raw_samples", None)
                raw_for_metadata.pop("_semel_codes", None)

                metadata: dict[str, Any] = {
                    "source": "data.gov.il",
                    "gov": {
                        "resource_id": resource_id,
                        "imported_at": now_utc_iso(),
                        "raw": raw_for_metadata,
                    },
                    # Keep parity with earlier schema hints
                    "legacy_gov_type": "Supervised",
                    "geocode": {
                        "provider": "mapbox",
                        "query": query,
                        "status": geo_status,
                        "place_name": place_name,
                        "cached": geo_status == "cached",
                        "is_fallback": is_fallback,
                    },
                }
                if use_local:
                    metadata["gov"]["source"] = "local_csv"
                if isinstance(raw_rows_count, int) and raw_rows_count > 1:
                    metadata["gov"]["raw_rows_count"] = raw_rows_count
                    if isinstance(raw_samples, list):
                        metadata["gov"]["raw_samples"] = raw_samples
                if isinstance(semel_codes, list) and len(semel_codes) > 1:
                    metadata["gov"]["semel_maon_codes"] = semel_codes

                # Always record the current semel on the record (for de-dupe + provenance).
                if semel:
                    metadata = merge_semel_into_metadata(metadata, semel)
                else:
                    # Mark records that are missing a semel so they can be reviewed later.
                    try:
                        gov_meta = metadata.get("gov")
                        if isinstance(gov_meta, dict):
                            gov_meta["missing_semel"] = True
                    except Exception:
                        pass

                if isinstance(maon_type_desc, str) and maon_type_desc.strip():
                    metadata["gov"]["maon_type_desc"] = maon_type_desc.strip()
                if maon_type_code is not None and str(maon_type_code).strip():
                    metadata["gov"]["maon_type_code"] = str(maon_type_code).strip()

                if isinstance(phone, str) and phone.strip():
                    metadata["phone"] = [phone.strip()]
                if isinstance(manager_name, str) and manager_name.strip():
                    metadata["manager_name"] = manager_name.strip()
                if isinstance(raw_status, str) and raw_status.strip():
                    metadata["raw_gov_status"] = raw_status.strip()

                if args.write and action.startswith("upserted"):
                    assert sb is not None
                    try:
                        # If we fuzzy-matched to an existing row, keep its primary maon_symbol_code if present,
                        # and record this semel in metadata.gov.semel_maon_codes instead.
                        p_maon_symbol_code = write_maon_symbol_code
                        sb.rpc(
                            "upsert_ganim_v2",
                            {
                                "p_id": str(rid),
                                "p_name_he": name_he,
                                "p_lon": float(lon),
                                "p_lat": float(lat),
                                "p_address": address,
                                "p_city": city,
                                "p_category": write_category,
                                "p_maon_symbol_code": p_maon_symbol_code,
                                "p_is_verified": True,
                                "p_metadata": metadata,
                                "p_is_fallback": bool(is_fallback),
                            },
                        ).execute()
                        inserted += 1
                    except Exception as e:
                        action = "error"
                        reason = str(e)

                if merged_into_id and action != "error":
                    reason = f"merged into existing row; duplicate of: {merged_into_id}"

                row = {
                    "id": str(rid),
                    "semel_maon": semel,
                    "name_he": name_he,
                    "city": city,
                    "address": address,
                    "query": query,
                    "geocode_status": geo_status,
                    "lat": lat,
                    "lon": lon,
                    "place_name": place_name,
                    "action": action,
                    "reason": reason,
                }
                w.writerow(row)

                # Optional: collect a ganim_v2-shaped preview table (for JSON/CSV/XLSX exports).
                want_preview = bool(args.output_json or args.output_table_csv or args.output_xlsx)
                if want_preview and action.startswith(("would_upsert", "upserted")):
                    try:
                        lon_f = float(lon)
                        lat_f = float(lat)
                    except Exception:
                        lon_f = float("nan")
                        lat_f = float("nan")

                    if (lon_f == lon_f) and (lat_f == lat_f):
                        json_preview_rows.append(
                            {
                                "id": str(rid),
                                "name_he": name_he,
                                "name_en": None,
                                "location": ewkb_point_hex(lon=lon_f, lat=lat_f, srid=4326),
                                "address": address or None,
                                "city": city or None,
                                "category": write_category,
                                "maon_symbol_code": write_maon_symbol_code,
                                "private_supervision": None,
                                "mishpachton_affiliation": None,
                                "municipal_grade": None,
                                "has_cctv": False,
                                "cctv_streamed_online": None,
                                "monthly_price_nis": None,
                                "min_age_months": None,
                                "max_age_months": None,
                                "price_notes": None,
                                "metadata": metadata,
                                "is_verified": True,
                                "suggested_by": None,
                                "suggested_at": None,
                                "created_at": None,
                                "updated_at": None,
                                "website_url": None,
                            }
                        )

                if total_seen % 200 == 0:
                    try:
                        cache.flush()
                    except Exception:
                        pass
                    try:
                        spellings_cache.flush()
                    except Exception:
                        pass

                # Progress: X / total (mapped Y, upserted Z)
                if total_seen % 100 == 0:
                    tq = f"{total_seen} / {total_expected}" if total_expected is not None else str(total_seen)
                    parts = [f"seen {tq}", f"mapped {total_mapped}"]
                    if args.write:
                        parts.append(f"upserted {inserted}")
                    print(f"Progress: {' | '.join(parts)}")
        except Exception as e:
            # Ensure the report isn't empty on crashes; write a single error line.
            w.writerow(
                {
                    "id": "",
                    "semel_maon": "",
                    "name_he": "",
                    "city": city,
                    "address": "",
                    "query": "",
                    "geocode_status": "",
                    "lat": "",
                    "lon": "",
                    "place_name": "",
                    "action": "error",
                    "reason": str(e),
                }
            )
            raise
        finally:
            trace.close()

    try:
        cache.flush()
    except Exception:
        pass
    try:
        spellings_cache.flush()
    except Exception:
        pass

    if args.output_json:
        try:
            out_json.write_text(json.dumps(json_preview_rows, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    if args.output_table_csv:
        try:
            write_ganim_v2_table_csv(json_preview_rows, out_table_csv)
        except Exception:
            pass

    if args.output_xlsx:
        try:
            write_ganim_v2_table_xlsx(json_preview_rows, out_xlsx)
        except Exception as e:
            # Don't fail the run due to missing Excel dependency; CSV/JSON may still exist.
            if args.trace:
                trace.log(f"[xlsx] skipped: {type(e).__name__}: {e}")

    print("=== Done ===")
    print(f"CKAN records seen: {total_seen}")
    if skipped_city_mismatch:
        print(f"Skipped (city mismatch): {skipped_city_mismatch}")
    print(f"Mapped rows output: {total_mapped}")
    print(
        " | ".join(
            [
                f"Mapbox calls: {geocode_calls}",
                f"ok: {geocode_ok}",
                f"cached: {geocode_cached}",
                f"cap_hits: {geocode_cap_hits}",
                f"skipped_insufficient_address: {skipped_geocode}",
                f"OpenAI calls: {openai_calls}",
            ]
        )
    )
    if args.write:
        print(f"Upserted into ganim_v2: {inserted}")
    print(f"Report: {out_csv}")
    if args.output_json:
        print(f"JSON preview: {out_json}")
    if args.output_table_csv:
        print(f"Table CSV: {out_table_csv}")
    if args.output_xlsx:
        print(f"Excel: {out_xlsx}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted.")
        raise SystemExit(130)

