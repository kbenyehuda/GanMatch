#!/usr/bin/env python3
"""
Parse WhatsApp .txt chat exports, extract place recommendations via Claude,
and insert them as places + reviews into the database.

Usage:
  python parse_whatsapp.py chat1.txt [chat2.txt ...] [--dry-run]

For each recommendation found:
  - Creates (or finds) the place in the places table
  - Inserts a place_reviews row with the original text
    reviewer_public_name = "חבר/ה מהשכונה"  (shown in app)
    whatsapp_reviewer_name = real contact name (stored, not shown)
  - Rating: 5 (enthusiastic), 4 (positive), 2 (negative)

Reviews are owned by a bot user (whatsapp-import@givemytime.local)
created automatically on first run.

Credentials loaded from root .env.local.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client
import anthropic

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")

GIVATAYIM_CENTER = (32.0702, 34.8117)
CHUNK_SIZE = 60  # messages per Claude call


# ---------------------------------------------------------------------------
# WhatsApp parser
# ---------------------------------------------------------------------------

# Handles formats:
#   [DD/MM/YYYY, HH:MM:SS] Name: text
#   [M/D/YY, H:MM:SS AM] Name: text
#   DD.MM.YYYY, HH:MM - Name: text
MSG_PATTERN = re.compile(
    r"^\[?(\d{1,2}[./]\d{1,2}[./]\d{2,4}),?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\]?\s*-?\s*"
    r"([^:]+?):\s(.+)$"
)

SKIP_PATTERNS = (
    re.compile(r"^<Media omitted>$", re.I),
    re.compile(r"^image omitted$", re.I),
    re.compile(r"^video omitted$", re.I),
    re.compile(r"^audio omitted$", re.I),
    re.compile(r"^sticker omitted$", re.I),
    re.compile(r"^הודעה זו נמחקה$"),
    re.compile(r"^‎?Messages and calls are end-to-end encrypted", re.I),
)


def parse_chat(path: Path) -> list[dict]:
    """Return list of {name, text} dicts from a WhatsApp export file."""
    messages = []
    current: dict | None = None

    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip()
            m = MSG_PATTERN.match(line)
            if m:
                if current:
                    messages.append(current)
                name = m.group(2).strip()
                text = m.group(3).strip()
                # Skip system messages (phone numbers as names)
                if re.match(r"^\+?\d[\d\s\-()]+$", name):
                    current = None
                    continue
                if any(p.match(text) for p in SKIP_PATTERNS):
                    current = None
                    continue
                current = {"name": name, "text": text}
            elif current and line:
                # Continuation of previous message
                current["text"] += " " + line.strip()

    if current:
        messages.append(current)

    return messages


# ---------------------------------------------------------------------------
# Claude extraction
# ---------------------------------------------------------------------------

EXTRACT_TOOL = {
    "name": "extract_recommendations",
    "description": "Extract place recommendations from a batch of WhatsApp messages.",
    "input_schema": {
        "type": "object",
        "properties": {
            "recommendations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "place_name":          {"type": "string", "description": "שם המקום"},
                        "category":            {"type": "string", "enum": ["doctor", "cafe", "food", "wellness", "attraction", "kids"]},
                        "address_hint":        {"type": "string", "description": "כתובת חלקית אם מוזכרת, אחרת null"},
                        "recommendation_text": {"type": "string", "description": "הטקסט המקורי שכתב השולח"},
                        "reviewer_name":       {"type": "string", "description": "שם איש הקשר (מהשדה name)"},
                        "enthusiasm":          {"type": "string", "enum": ["high", "medium", "negative"], "description": "high=ממליץ בחום, medium=ממליץ, negative=לא ממליץ"},
                    },
                    "required": ["place_name", "category", "recommendation_text", "reviewer_name", "enthusiasm"],
                },
            }
        },
        "required": ["recommendations"],
    },
}

SYSTEM_PROMPT = """אתה מנתח שיחות WhatsApp בעברית ומחפש המלצות על מקומות בגבעתיים.
זהה רק הודעות שמכילות המלצה ספציפית ואמיתית על עסק, רופא, קפה, מסעדה, מכון כושר, או שירות.
התעלם מהודעות כלליות, שאלות, ושיחות שאינן המלצות.
עבור כל המלצה שנמצאת, חלץ את המידע המבוקש.

קטגוריות: doctor (רופאים, רוקחים, מרפאות), cafe (קפה), food (מסעדות, אוכל), wellness (כושר, ספא, יופי, תסרוקת, ציפורניים), attraction (אטרקציות, מוזיאונים), kids (פעילויות ילדים)"""


def extract_recommendations(client: anthropic.Anthropic, messages: list[dict]) -> list[dict]:
    """Send a batch of messages to Claude and return extracted recommendations."""
    batch_text = "\n".join(
        f"[{m['name']}]: {m['text']}" for m in messages
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": f"הודעות לניתוח:\n\n{batch_text}"}],
        tools=[EXTRACT_TOOL],
        tool_choice={"type": "any"},
    )

    for block in response.content:
        if block.type == "tool_use" and block.name == "extract_recommendations":
            return block.input.get("recommendations", [])

    return []


# ---------------------------------------------------------------------------
# Geocoding
# ---------------------------------------------------------------------------

def geocode(name: str, address_hint: str | None) -> tuple[float, float]:
    query = address_hint or f"{name} גבעתיים ישראל"
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1, "countrycodes": "il"},
            headers={"User-Agent": "GiveMytime-PlacesImport/1.0"},
            timeout=10,
        )
        data = resp.json()
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        pass
    return GIVATAYIM_CENTER


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _contact_email(name: str) -> str:
    """Deterministic synthetic email for a WhatsApp contact name."""
    import hashlib
    slug = hashlib.md5(name.strip().encode("utf-8")).hexdigest()[:16]
    return f"whatsapp-{slug}@givemytime.local"


def get_or_create_contact_user(supabase, name: str, cache: dict[str, str]) -> str:
    """
    Return the UUID for this WhatsApp contact, creating a synthetic auth user if needed.
    Cache is keyed by contact name to avoid redundant API calls within a run.
    """
    if name in cache:
        return cache[name]

    email = _contact_email(name)
    try:
        resp = supabase.auth.admin.create_user({
            "email": email,
            "password": f"WA!{email}",
            "email_confirm": True,
            "user_metadata": {"whatsapp_name": name},
        })
        uid = str(resp.user.id)
    except Exception:
        # User already exists from a previous run — find it
        users = supabase.auth.admin.list_users()
        uid = next(
            (str(u.id) for u in users if getattr(u, "email", None) == email),
            None,
        )
        if not uid:
            raise RuntimeError(f"Could not create or find user for contact '{name}' ({email})")

    cache[name] = uid
    return uid


def find_place_by_name(supabase, name: str) -> str | None:
    """Return existing place UUID if a place with this name already exists."""
    result = supabase.table("places").select("id").ilike("name", name).limit(1).execute()
    rows = result.data or []
    return rows[0]["id"] if rows else None


def create_place(supabase, rec: dict) -> str:
    lat, lon = geocode(rec["place_name"], rec.get("address_hint"))
    resp = supabase.rpc("insert_community_place", {
        "p_name": rec["place_name"],
        "p_category": rec["category"],
        "p_lon": lon,
        "p_lat": lat,
        "p_address": rec.get("address_hint"),
        "p_description": None,
        "p_phone": None,
        "p_website": None,
        "p_hours": None,
        "p_user_id": None,
    }).execute()
    place_id = resp.data
    supabase.table("places").update({
        "source": "whatsapp",
        "is_verified": False,
    }).eq("id", place_id).execute()
    return place_id


def insert_review(supabase, place_id: str, bot_user_id: str, rec: dict) -> bool:
    rating_map = {"high": 5.0, "medium": 4.0, "negative": 2.0}
    rating = rating_map.get(rec["enthusiasm"], 4.0)

    try:
        supabase.table("place_reviews").insert({
            "user_id": bot_user_id,
            "place_id": place_id,
            "rating": rating,
            "text": rec["recommendation_text"],
            "reviewer_public_name": "חבר/ה מהשכונה",
            "whatsapp_reviewer_name": rec["reviewer_name"],
            "is_anonymous": True,
            "allow_contact": False,
        }).execute()
        return True
    except Exception as e:
        # UNIQUE constraint = this bot already reviewed this place
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            return False
        raise


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    dry_run = "--dry-run" in sys.argv
    chat_files = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]

    if not chat_files:
        print("Usage: python parse_whatsapp.py chat1.txt [chat2.txt ...] [--dry-run]")
        return 1

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1
    if not ANTHROPIC_KEY:
        print("ERROR: Set ANTHROPIC_API_KEY in .env.local")
        return 1

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    claude = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
    contact_cache: dict[str, str] = {}  # name → auth user UUID

    all_recs: list[dict] = []

    for chat_path in chat_files:
        if not chat_path.exists():
            print(f"File not found: {chat_path}", file=sys.stderr)
            continue

        print(f"\nParsing {chat_path.name}...")
        messages = parse_chat(chat_path)
        print(f"  {len(messages)} messages")

        # Chunk and send to Claude
        for i in range(0, len(messages), CHUNK_SIZE):
            chunk = messages[i:i + CHUNK_SIZE]
            print(f"  Extracting from messages {i+1}–{i+len(chunk)}...", end=" ", flush=True)
            try:
                recs = extract_recommendations(claude, chunk)
                print(f"{len(recs)} recommendations found")
                all_recs.extend(recs)
            except Exception as e:
                print(f"ERROR: {e}", file=sys.stderr)
            time.sleep(0.5)

    print(f"\n{len(all_recs)} total recommendations extracted")

    if dry_run:
        for r in all_recs:
            print(f"  [{r['enthusiasm']:8}] {r['category']:12} | {r['place_name']} — by {r['reviewer_name']}")
            print(f"           {r['recommendation_text'][:100]}")
        return 0

    places_created = 0
    reviews_inserted = 0
    skipped = 0

    for rec in all_recs:
        place_name = rec["place_name"]

        place_id = find_place_by_name(supabase, place_name)
        if place_id:
            print(f"  ~ found existing place: {place_name}")
        else:
            try:
                place_id = create_place(supabase, rec)
                print(f"  + created place: {place_name} ({rec['category']})")
                places_created += 1
                time.sleep(0.1)
            except Exception as e:
                print(f"  ERROR creating {place_name}: {e}", file=sys.stderr)
                skipped += 1
                continue

        try:
            rating_label = {"high": 5, "medium": 4, "negative": 2}.get(rec["enthusiasm"], 4)
            reviewer_uid = None if dry_run else get_or_create_contact_user(
                supabase, rec["reviewer_name"], contact_cache
            )
            ok = insert_review(supabase, place_id, reviewer_uid, rec)
            if ok:
                print(f"    ✓ review by {rec['reviewer_name']} (rating {rating_label})")
                reviews_inserted += 1
            else:
                print(f"    ~ review already exists for this place, skipping")
                skipped += 1
        except Exception as e:
            print(f"  ERROR inserting review for {place_name}: {e}", file=sys.stderr)
            skipped += 1

        time.sleep(0.05)

    print(f"\nDone: {places_created} places created, {reviews_inserted} reviews inserted, {skipped} skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
