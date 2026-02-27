"""
Geocode Israeli addresses to lat/lon.
Uses Nominatim (OpenStreetMap) - no API key. 1 request/second required.
"""

import os
import re
import time
import requests

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_HEADERS = {
    "User-Agent": "GanMatch/1.0 (daycare finder; https://github.com/ganmatch)",
    "Accept": "application/json",
    "Accept-Language": "he,en",
}

SKIP_GEOCODE = os.getenv("SKIP_GEOCODE", "").lower() in ("1", "true", "yes")
CITY_CENTERS = {"תל אביב": (32.0853, 34.7818), "גבעתיים": (32.0702, 34.8117)}

CITY_ALIASES: dict[str, list[str]] = {
    "תל אביב": ["תל אביב-יפו", "תל אביב יפו", "Tel Aviv-Yafo", "Tel Aviv"],
    "גבעתיים": ["Givatayim", "גבעתיים"],
}


def _clean_address(addr: str, city: str | None) -> str:
    for junk in ["פתיחת מידע נוסף:", "סגירת מידע נוסף:", "לחצו לפרטים"]:
        addr = addr.replace(junk, "").strip()
    addr = re.sub(r"\s+", " ", addr).strip(" ,")
    city = (city or "").strip()
    return f"{addr}, {city}, Israel" if city else f"{addr}, Israel"


def _query_variants(address: str, city: str | None) -> list[str]:
    """
    Nominatim can be picky. Try a few small variants:
    - full address
    - first segment before comma
    - city aliases (e.g. תל אביב-יפו)
    """
    addr = re.sub(r"\s+", " ", (address or "").strip())
    if not addr:
        return []

    addr_candidates = [addr]
    if "," in addr:
        first = addr.split(",", 1)[0].strip()
        if first and first != addr:
            addr_candidates.append(first)

    city_norm = (city or "").strip()
    city_candidates = [city_norm] if city_norm else []
    for alias in CITY_ALIASES.get(city_norm, []):
        if alias and alias not in city_candidates:
            city_candidates.append(alias)

    variants: list[str] = []
    if city_candidates:
        for a in addr_candidates:
            for c in city_candidates:
                variants.append(_clean_address(a, c))
    else:
        for a in addr_candidates:
            variants.append(_clean_address(a, None))

    # de-dupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for q in variants:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out[:6]


def geocode(address: str, city: str | None = None) -> tuple[float, float] | None:
    """Geocode address in Israel via Nominatim. No API key. Returns (lat, lon) or None."""
    if SKIP_GEOCODE:
        return None
    addr = (address or "").strip()
    if len(addr) < 3:
        return None

    for query in _query_variants(addr, city):
        try:
            resp = requests.get(
                NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "il",
                },
                headers=NOMINATIM_HEADERS,
                timeout=20,
            )
            # Handle soft-rate-limit cases with a small backoff
            if resp.status_code in (429, 503):
                time.sleep(2.5)
                continue
            resp.raise_for_status()
            data = resp.json()
            if data:
                return (float(data[0]["lat"]), float(data[0]["lon"]))
        except Exception as e:
            print(f"  [geocode] {e}")
    return None


def geocode_with_retry(address: str, city: str | None = None) -> tuple[float, float] | None:
    """Geocode with Nominatim rate limit (1 req/sec)."""
    result = geocode(address, city)
    if not SKIP_GEOCODE:
        time.sleep(1.1)
    return result


def get_city_center(city: str | None) -> tuple[float, float]:
    """Fallback when geocoding fails."""
    return CITY_CENTERS.get(city or "", (32.08, 34.78))
