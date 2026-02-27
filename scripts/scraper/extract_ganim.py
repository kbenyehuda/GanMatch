"""
Extract daycare entries from Tel Aviv / Givatayim municipal pages.
Targets the specific "מעונות יום" table structure.
"""

import re
from bs4 import BeautifulSoup

# Column indices for Tel Aviv daycare table (שם המעון, ארגון מפעיל, טלפון, אוכלוסיית יעד, שעות פעילות, כתובת המעון, שם השכונה)
COL_NAME, COL_ORG, COL_PHONE, COL_TARGET, COL_HOURS, COL_ADDRESS, COL_NEIGHBORHOOD = 0, 1, 2, 3, 4, 5, 6
PHONE_RE = re.compile(r"0\d[\d\-]{7,}")


def extract_coords_from_element(element) -> tuple[float, float] | None:
    """Extract lat,lon from links in an HTML element."""
    if element is None:
        return None
    html = str(element)
    for match in re.finditer(
        r"@(-?\d+\.\d+),(-?\d+\.\d+)|q=(-?\d+\.\d+),(-?\d+\.\d+)|"
        r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)",
        html,
    ):
        groups = [g for g in match.groups() if g is not None]
        for i in range(0, len(groups) - 1, 2):
            try:
                lat, lon = float(groups[i]), float(groups[i + 1])
                if 31 <= lat <= 34 and 34 <= lon <= 36:
                    return (lat, lon)
            except (ValueError, IndexError):
                pass
    return None


# Substrings that indicate non-daycare content (nav, services, events, community centers)
JUNK_SUBSTR = (
    "עיריית", "עירייה", "משרד ראשי", "מרכז שירות", "מרכז השירות לתושב",
    "חירום", "לוח אירועים", "מכרזים", "מכרז", "דרושים",
    "מקלטים ציבוריים", "וואטסאפ למוקד", "התחדשות עירונית",
    "אירועים לגיל הרך", "קבלת עדכונים", "רישום בחינוך",
    "לשלם ארנונה", "דוחות מפגעים", "מפגעים", "אגרת שילוט",
    "דוח חניה", "חשבון מים", "רשיון לכריתת", "כריתת עץ",
    "לקבל שירותים", "זימון תורים", "איסוף ופינוי", "פינוי אשפה",
    "פינוי גזם", "גרוטאות", "רווחה ושירותים", "תו חניה",
    "משחקיית", "מרכז קהילתי", "הרצאה", "ריקודי עם",
    "חוג בוקר", " - חוג", "מגיל לידה ועד",
)

ADDRESS_JUNK_EXACT = {
    "כתובת",
    "שעות פעילות",
    "טלפון",
    "לחצו לפרטים",
    "פתיחת מידע",
    "סגירת מידע",
    "שם המעון",
}

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


def _is_junk_name(s: str) -> bool:
    """Reject UI strings, generic labels, municipal offices, and non-daycare entries."""
    junk = {
        "מעון יום", "פתיחת מידע", "סגירת מידע", "לחצו לפרטים",
        "שם המעון", "ארגון מפעיל", "טלפון", "כתובת", "שעות פעילות",
        "גילאי 0.6 עד 2.8", "07:30 - 16:00",
        "גבעתיים", "תל אביב", "תל-אביב",
    }
    t = (s or "").strip()
    if not t or t in junk or len(t) < 2 or t.startswith("גילאי"):
        return True
    if len(t.split()) > 3:
        return True
    if any(x in t for x in JUNK_SUBSTR):
        return True
    return False


def _is_junk_address(s: str) -> bool:
    """
    Addresses often have >3 words (e.g. 'רחוב אבן גבירול 30'), so we must NOT
    apply the 'name' heuristics here. Only reject clear UI/junk strings.
    """
    t = (s or "").strip()
    if not t or len(t) < 3:
        return True
    if t in ADDRESS_JUNK_EXACT:
        return True
    if t.startswith(("פתיחת מידע", "סגירת מידע", "פתיחת מידע נוסף", "סגירת מידע נוסף")):
        return True
    return False


def _parse_details_blob(text: str) -> tuple[str | None, dict]:
    """
    Some municipal pages embed multiple fields into the "address" cell (manager, phone, etc).
    Extract a clean address and move the rest into metadata.
    """
    if not text:
        return None, {}

    blob = " ".join(str(text).split()).strip()
    if not blob:
        return None, {}

    # Normalize separators to help regex stop conditions
    blob = blob.replace("•", "|").replace("｜", "|").replace("│", "|")
    blob = re.sub(r"\s*\|\s*", " | ", blob)

    meta: dict = {}

    m_addr = _RE_HE_ADDRESS.search(blob)
    address = m_addr.group(1).strip(" ,") if m_addr else None

    m_phone = _RE_HE_PHONE.search(blob)
    if m_phone:
        phone = m_phone.group(1).strip()
        phone = re.sub(r"\s+", "", phone)
        if PHONE_RE.search(phone):
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

    # If no labeled address found, use the first segment before a labeled key as a best-effort address.
    if not address:
        cut = re.split(r"\b(?:טלפון|מנהלת|מנהל|שעות)\s*:", blob, maxsplit=1)
        candidate = (cut[0] if cut else "").strip(" |,")
        candidate = re.sub(r"\s+", " ", candidate).strip()
        if candidate and not _is_junk_address(candidate) and len(candidate) >= 4:
            address = candidate[:200]

    if address and _is_junk_address(address):
        address = None

    return address, meta


def _parse_tel_aviv_table(soup: BeautifulSoup, city_he: str) -> list[dict]:
    """Parse the Tel Aviv daycare table (caption = מעונות יום)."""
    ganim = []
    # Target table with caption "מעונות יום" inside .tableNormal
    for div in soup.select("div.tableNormal"):
        table = div.find("table", class_="table-lg")
        if not table:
            continue
        cap = table.find("caption")
        if cap and "מעונות יום" not in cap.get_text():
            continue
        thead = table.find("thead")
        if thead and "שם המעון" not in thead.get_text():
            continue
        rows = table.find("tbody")
        if not rows:
            continue
        for tr in rows.find_all("tr"):
            cells = tr.find_all("td")
            if len(cells) < 5:
                continue
            cells_text = [c.get_text(strip=True) for c in cells]
            # Use title attribute when first cell is generic "מעון יום"
            name_he = tr.get("title") or cells_text[COL_NAME] if len(cells_text) > COL_NAME else ""
            name_he = (name_he or "").replace('"', '"').strip()
            for prefix in ("פתיחת מידע נוסף:", "סגירת מידע נוסף:", "פתיחת מידע נוסף : ", "סגירת מידע נוסף : "):
                if name_he.startswith(prefix):
                    name_he = name_he[len(prefix):].strip()
                    break
            name_he = name_he[:200]
            if _is_junk_name(name_he):
                continue
            org = cells_text[COL_ORG] if len(cells_text) > COL_ORG else ""
            phone = ""
            for c in cells_text:
                m = PHONE_RE.search(c)
                if m:
                    phone = m.group().replace(" ", "")
                    break
            address_blob = (
                cells[COL_ADDRESS].get_text(separator=" | ", strip=True)
                if len(cells) > COL_ADDRESS
                else (cells_text[COL_ADDRESS] if len(cells_text) > COL_ADDRESS else "")
            )
            address, meta_from_blob = _parse_details_blob(address_blob)
            neighborhood = cells_text[COL_NEIGHBORHOOD] if len(cells_text) > COL_NEIGHBORHOOD else ""
            if neighborhood and _is_junk_address(neighborhood):
                neighborhood = ""
            if address and neighborhood:
                address = f"{address}, {neighborhood}"
            elif neighborhood:
                address = neighborhood
            if not name_he:
                continue
            metadata: dict = {}
            if phone:
                metadata["phone"] = [phone]
            if org and not _is_junk_name(org):
                metadata["org"] = org[:120]
            # Merge structured fields parsed from the blob (keep explicit phone extracted above as canonical)
            if isinstance(meta_from_blob, dict) and meta_from_blob:
                if "phone" in meta_from_blob and "phone" not in metadata:
                    metadata["phone"] = meta_from_blob["phone"]
                for k, v in meta_from_blob.items():
                    if k == "phone":
                        continue
                    metadata[k] = v
            g = {
                "name_he": name_he,
                "name_en": None,
                "address": address or None,
                "city": city_he,
                "type": "Supervised",
                "license_status": "Permanent",
                "has_cctv": False,
                "metadata": metadata,
            }
            coords = extract_coords_from_element(tr)
            if coords:
                g["_coords"] = coords
            ganim.append(g)
        if ganim:
            break
    return ganim


def _parse_givatayim(soup: BeautifulSoup, city_he: str) -> list[dict]:
    """Parse Givatayim page - adjust selectors based on actual structure."""
    ganim = []
    for table in soup.find_all("table"):
        cap = table.find("caption")
        if cap and "מעון" in cap.get_text():
            rows = table.find("tbody") or table
            for tr in rows.find_all("tr")[1:]:
                cells = tr.find_all("td")
                if len(cells) < 2:
                    continue
                cells_text = [c.get_text(strip=True) for c in cells]
                name_he = (cells_text[0] or "").strip()[:200]
                if _is_junk_name(name_he):
                    continue
                details_blob = " | ".join([c for c in cells_text[1:] if c]).strip()
                address, meta_from_blob = _parse_details_blob(details_blob)
                phone = ""
                for c in cells_text:
                    m = PHONE_RE.search(c)
                    if m:
                        phone = m.group()
                        break
                metadata: dict = {}
                if phone:
                    metadata["phone"] = [phone.replace(" ", "")]
                if isinstance(meta_from_blob, dict) and meta_from_blob:
                    if "phone" in meta_from_blob and "phone" not in metadata:
                        metadata["phone"] = meta_from_blob["phone"]
                    for k, v in meta_from_blob.items():
                        if k == "phone":
                            continue
                        metadata[k] = v
                g = {
                    "name_he": name_he,
                    "name_en": None,
                    "address": address or None,
                    "city": city_he,
                    "type": "Supervised",
                    "license_status": "Permanent",
                    "has_cctv": False,
                    "metadata": metadata,
                }
                coords = extract_coords_from_element(tr)
                if coords:
                    g["_coords"] = coords
                ganim.append(g)
            if ganim:
                break
    return ganim


def extract_ganim_from_html(html: str, city_he: str, city_en: str) -> list[dict]:
    """Extract daycare entries. Uses city-specific parsers."""
    soup = BeautifulSoup(html, "html.parser")
    if "תל אביב" in city_he or "תל-אביב" in city_he or "tel-aviv" in html.lower():
        return _parse_tel_aviv_table(soup, city_he)
    return _parse_givatayim(soup, city_he)
