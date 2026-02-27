#!/usr/bin/env python3
"""
Import ganim from a KML file (e.g. exported from Google My Maps).
Use this for the Givatayim map: https://www.google.com/maps/d/u/0/viewer?mid=1Fu8muzSdopFv2SGzAZMb_xkd1Vp1x2A

1. Open the map in Google My Maps
2. Click ⋮ (menu) → Export to KML
3. Download the KML file
4. Run: python import_from_kml.py givatayim.kml [--city "גבעתיים"]

Placemarks need a name; address is looked up via Nominatim to get coordinates.
If the KML has coordinates, they are used as fallback when geocoding fails.
"""

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
from geocode import geocode_with_retry, get_city_center

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


def _get_text(el) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def _find_by_local_name(parent, local_name: str):
    """Find first element by local name (ignore namespace)."""
    for el in parent.iter():
        if el is parent:
            continue
        tag = el.tag.split("}")[-1] if "}" in el.tag else el.tag
        if tag == local_name:
            return el
    return None


def _extract_address(desc: str) -> str | None:
    """Backward-compatible wrapper: returns parsed address only."""
    address, _ = _parse_description(desc)
    return address


_RE_HE_ADDRESS = re.compile(
    r"(?:כתובת(?:\s*המעון)?|כתובת\s*המסגרת)\s*:\s*(.+?)(?=(?:\s*\|\s*|טלפון\s*:|מנהלת\s*:|מנהל\s*:|שעות\s*:|$))",
    re.I,
)
_RE_HE_PHONE = re.compile(r"טלפון\s*:\s*([0-9\- ]{8,})", re.I)
_RE_HE_MANAGER = re.compile(
    r"(?:מנהלת|מנהל)(?:\s*המעון|\s*המסגרת)?\s*:\s*(.+?)(?=(?:\s*\|\s*|טלפון\s*:|$))",
    re.I,
)
_RE_HE_HOURS = re.compile(r"שעות(?:\s*פעילות)?\s*:\s*(.+?)(?=(?:\s*\|\s*|$))", re.I)


def _parse_description(desc: str) -> tuple[str | None, dict]:
    """
    KML descriptions often contain a full details blob (manager, phone, etc).
    Extract a clean address and keep the rest in metadata.
    """
    if not desc or len(desc) < 5:
        return None, {}

    plain = re.sub(r"<[^>]+>", " ", desc)
    plain = " ".join(plain.split()).strip()
    if not plain:
        return None, {}

    blob = plain.replace("•", "|").replace("｜", "|").replace("│", "|")
    blob = re.sub(r"\s*\|\s*", " | ", blob)

    meta: dict = {}

    m_addr = _RE_HE_ADDRESS.search(blob)
    address = m_addr.group(1).strip(" ,") if m_addr else None

    m_phone = _RE_HE_PHONE.search(blob)
    if m_phone:
        phone = re.sub(r"\s+", "", m_phone.group(1).strip())
        if phone:
            meta["phone"] = [phone]

    m_mgr = _RE_HE_MANAGER.search(blob)
    if m_mgr:
        manager_name = m_mgr.group(1).strip(" ,")
        if manager_name and len(manager_name) >= 2:
            meta["manager_name"] = manager_name[:120]

    m_hours = _RE_HE_HOURS.search(blob)
    if m_hours:
        hours = m_hours.group(1).strip(" ,")
        if hours and len(hours) >= 3:
            meta["hours"] = hours[:120]

    # If no labeled address exists, treat the whole string as a note, not an address.
    if not address and len(blob) <= 180:
        # Sometimes My Maps description is just an address with no labels.
        if any(ch.isdigit() for ch in blob) and any(x in blob for x in ("רחוב", "שד", "שדרות", "דרך", "כיכר", "סמט", "רח'")):
            address = blob[:200]
        else:
            meta["notes"] = blob[:250]

    return (address[:200] if address else None), meta


def parse_kml(path: Path, city_default: str = "גבעתיים") -> list[dict]:
    """Parse KML. Returns {name_he, address, city, metadata, lat?, lon?}. Coords optional - geocode from address."""
    import xml.etree.ElementTree as ET

    tree = ET.parse(path)
    root = tree.getroot()

    ganim = []
    for pm in root.iter():
        tag = pm.tag.split("}")[-1] if "}" in pm.tag else pm.tag
        if tag != "Placemark":
            continue

        name_el = pm.find("{http://www.opengis.net/kml/2.2}name") or _find_by_local_name(pm, "name")
        name_he = _get_text(name_el) if name_el is not None else ""
        name_he = name_he[:200].strip()
        if not name_he or len(name_he) < 2:
            continue

        desc_el = pm.find("{http://www.opengis.net/kml/2.2}description") or _find_by_local_name(pm, "description")
        desc = _get_text(desc_el) if desc_el is not None else ""
        address, metadata = _parse_description(desc)
        if not address and len(desc) >= 10:
            # last-resort fallback: keep a short note, but don't poison address
            metadata = metadata or {}
            metadata.setdefault("notes", " ".join(desc.split())[:250])

        # ExtendedData may have address in a Data element
        ext = pm.find("{http://www.opengis.net/kml/2.2}ExtendedData") or _find_by_local_name(pm, "ExtendedData")
        if ext is not None:
            for data in ext.iter():
                if "Data" in (data.tag.split("}")[-1] if "}" in data.tag else data.tag):
                    name_attr = data.get("name") or ""
                    name_attr_l = name_attr.lower()
                    if ("address" in name_attr_l or "כתובת" in name_attr) and not address:
                        val = _find_by_local_name(data, "value")
                        if val is not None:
                            v = _get_text(val)[:300] or ""
                            address = v.strip()[:200] or None
                    if ("phone" in name_attr_l or "טלפון" in name_attr) and "phone" not in (metadata or {}):
                        val = _find_by_local_name(data, "value")
                        if val is not None:
                            v = re.sub(r"\s+", "", _get_text(val))
                            if v:
                                metadata = metadata or {}
                                metadata["phone"] = [v]
                    if ("manager" in name_attr_l or "מנהלת" in name_attr or "מנהל" in name_attr) and "manager_name" not in (metadata or {}):
                        val = _find_by_local_name(data, "value")
                        if val is not None:
                            v = _get_text(val).strip()
                            if v:
                                metadata = metadata or {}
                                metadata["manager_name"] = v[:120]

        lat, lon = None, None
        coords_el = pm.find(".//{http://www.opengis.net/kml/2.2}coordinates") or _find_by_local_name(pm, "coordinates")
        if coords_el is not None:
            coords_text = (coords_el.text or "").strip()
            match = re.search(r"([-\d.]+)\s*,\s*([-\d.]+)", coords_text)
            if match:
                lon, lat = float(match.group(1)), float(match.group(2))
                if not (31 <= lat <= 34 and 34 <= lon <= 36):
                    lat, lon = None, None

        ganim.append({
            "name_he": name_he,
            "address": address,
            "city": city_default,
            "metadata": metadata or {},
            "lat": lat,
            "lon": lon,
        })
    return ganim


def main():
    parser = argparse.ArgumentParser(
        description="Import ganim from KML (Google My Maps export)"
    )
    parser.add_argument("kml_file", type=Path, help="Path to KML file")
    parser.add_argument(
        "--city",
        default="גבעתיים",
        help="City name for all placemarks (default: גבעתיים)",
    )
    args = parser.parse_args()

    if not args.kml_file.exists():
        print(f"File not found: {args.kml_file}")
        return 1

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
        return 1

    print(f"Parsing {args.kml_file} ...")
    ganim = parse_kml(args.kml_file, city_default=args.city)
    print(f"Found {len(ganim)} placemarks")

    if not ganim:
        print("No valid placemarks. Check that the KML has Placemarks with <name>.")
        return 1

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    inserted = 0
    for i, g in enumerate(ganim):
        lat, lon = g.get("lat"), g.get("lon")
        address = g.get("address")
        city = g["city"]
        metadata = g.get("metadata") if isinstance(g.get("metadata"), dict) else {}

        # If we have an address, geocode it to get coordinates
        if address and len(address) >= 5:
            coords = geocode_with_retry(address, city)
            if coords:
                lat, lon = coords[0], coords[1]
                print(f"  [{i+1}/{len(ganim)}] Geocoded: {g['name_he'][:35]} → {address[:40]}...")
            elif lat is not None and lon is not None:
                print(f"  [{i+1}/{len(ganim)}] Geocode failed, using KML coords: {g['name_he'][:35]}")
            else:
                lat, lon = get_city_center(city)
                print(f"  [{i+1}/{len(ganim)}] No coords, using city center: {g['name_he'][:35]}")
        elif lat is not None and lon is not None:
            pass  # use KML coordinates
        else:
            lat, lon = get_city_center(city)
            print(f"  [{i+1}/{len(ganim)}] No address/coords, using city center: {g['name_he'][:35]}")

        try:
            supabase.rpc(
                "insert_gan",
                {
                    "p_name_he": g["name_he"],
                    "p_name_en": None,
                    "p_address": address,
                    "p_city": city,
                    "p_type": "Supervised",
                    "p_license_status": "Permanent",
                    "p_has_cctv": False,
                    "p_metadata": metadata or {},
                    "p_lon": lon,
                    "p_lat": lat,
                },
            ).execute()
            inserted += 1
            print(f"    → {lat:.4f},{lon:.4f}")
        except Exception as e:
            print(f"  Error for {g['name_he'][:30]}: {e}")

    print(f"\nImported {inserted} ganim from KML.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
