"""
LLM-based extraction of daycare (ganim) info from HTML.
Uses the LLM to identify and extract daycare entries from page content.
"""

import json
import os
import re

# Optional: openai or anthropic
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


def _get_readable_chunks(html: str, max_chars: int = 80000) -> list[str]:
    """Extract likely-content regions to reduce token count."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    chunks = []
    # Tables (daycare lists are usually in tables)
    for table in soup.find_all("table"):
        text = table.get_text(separator=" | ", strip=True)
        if len(text) > 100 and any(c in text for c in "מעוןגןטלפוןכתובת"):
            chunks.append(f"[TABLE]\n{text[:15000]}")
    # Divs with table-like structure or "מעון" in text
    for div in soup.select("div.tableNormal, div.TlvTables, [ng-controller*='table']"):
        text = div.get_text(separator=" | ", strip=True)
        if len(text) > 200 and ("מעון" in text or "גן" in text or "טלפון" in text):
            chunks.append(f"[SECTION]\n{text[:15000]}")
    if not chunks:
        # Fallback: main content area
        main = soup.find("main") or soup.find("article") or soup.find(class_=re.compile("content|main", re.I))
        if main:
            chunks.append(main.get_text(separator=" | ", strip=True)[:max_chars])
    return chunks[:5]  # max 5 chunks to stay under context


def _get_openai_key() -> str:
    """Read OpenAI API key from system environment variables or .env files."""
    return (
        os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY") or ""
    ).strip()


def extract_ganim_with_llm(html: str, city_he: str, city_en: str) -> list[dict]:
    """
    Use LLM to extract daycare entries from page content.
    Requires OPENAI_API_KEY (or OPENAI_KEY) in system env or .env.
    """
    api_key = _get_openai_key()
    if not api_key or not OpenAI:
        return []

    chunks = _get_readable_chunks(html)
    if not chunks:
        return []

    content = "\n\n---\n\n".join(chunks)
    if len(content) > 70000:
        content = content[:70000] + "\n[... truncated]"

    system = """You extract daycare/gan (מעון יום, גן) entries from Israeli municipal web pages.
Return a JSON array. Each entry: {"name_he": "שם בעברית", "address": "כתובת", "phone": "טלפון", "org": "ארגון מפעיל if mentioned"}
- name_he: Hebrew name of the daycare (מעון/גן). Skip generic labels like "מעון יום" if no specific name.
- address: Street address, neighborhood, or location
- phone: Phone number (format 0X-XXXXXXX or similar)
- org: Operating organization if mentioned (e.g. אמונה, ויצו, ארגון פשר)
Only include actual daycare/gan entries. Skip headers, navigation, and non-daycare content.
If you find map links with coordinates (e.g. @32.08,34.78), include "lat" and "lon" in the entry."""

    user = f"""Extract all daycare (מעון יום) and kindergarten (גן) entries from this page content.
City context: {city_he} ({city_en or ''})
Return ONLY a valid JSON array, no markdown or explanation.

Content:
{content}"""

    try:
        model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        print(f"    [LLM] Sending {len(content)} chars to {model}...", flush=True)
        client = OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
        )
        text = resp.choices[0].message.content.strip()
        # Strip markdown code blocks if present
        if text.startswith("```"):
            text = re.sub(r"^```\w*\n?", "", text)
            text = re.sub(r"\n?```$", "", text)
        data = json.loads(text)
    except json.JSONDecodeError as e:
        print(f"  [LLM] JSON parse error: {e}")
        return []
    except Exception as e:
        print(f"  [LLM] Error: {e}")
        return []

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
        "חוג בוקר", "מגיל לידה ועד",
    )

    def _is_junk(name: str) -> bool:
        """Reject municipal offices, nav links, events, community centers, services."""
        if not name or len(name) < 2:
            return True
        if len(name.split()) > 3:
            return True
        junk_exact = {"מעון יום", "גבעתיים", "תל אביב", "תל-אביב"}
        if name in junk_exact:
            return True
        if any(x in name for x in JUNK_SUBSTR):
            return True
        return False

    ganim = []
    for row in data if isinstance(data, list) else []:
        if not isinstance(row, dict):
            continue
        name = (row.get("name_he") or row.get("name") or "").strip()
        if _is_junk(name):
            continue
        addr = (row.get("address") or row.get("כתובת") or "").strip()
        phone = (row.get("phone") or row.get("טלפון") or "").strip()
        org = (row.get("org") or "").strip()
        g = {
            "name_he": name[:200],
            "name_en": None,
            "address": addr or None,
            "city": city_he,
            "type": "Supervised",
            "license_status": "Permanent",
            "has_cctv": False,
            "metadata": {"phone": [phone]} if phone else {},
        }
        if org:
            g["metadata"]["org"] = org
        if "lat" in row and "lon" in row:
            try:
                lat, lon = float(row["lat"]), float(row["lon"])
                if 31 <= lat <= 34 and 34 <= lon <= 36:
                    g["_coords"] = (lat, lon)
            except (ValueError, TypeError):
                pass
        ganim.append(g)

    return ganim
