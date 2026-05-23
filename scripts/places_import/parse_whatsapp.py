#!/usr/bin/env python3
"""
Parse WhatsApp .txt chat exports, extract place recommendations via Claude,
and insert them into whatsapp_import_staging for human review.

Usage:
  python parse_whatsapp.py chat1.txt [chat2.txt ...] [--dry-run] [--max-chunks=N]

  --max-chunks=N   Process only the first N chunks per file (for test runs).
                   Remove or set to a large number to process the full file.

Recommendations land in whatsapp_import_staging (status=pending).
Review and approve them at /admin/whatsapp.

Credentials loaded from root .env.local.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
import openai

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

OPENAI_MODEL = "gpt-4o-mini"  # cheap and capable; switch to "gpt-4o" for higher accuracy

CHUNK_SIZE = 60    # messages per Claude call
DEFAULT_OVERLAP = 30  # overlap between chunks to avoid splitting threads


# ---------------------------------------------------------------------------
# WhatsApp parser
# ---------------------------------------------------------------------------

# Confirmed format from user's export: M/D/YY, HH:MM - Name: text
# Also handles: [DD/MM/YYYY, HH:MM:SS] Name: text and DD.MM.YYYY, HH:MM - Name: text
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
    re.compile(r"‎?Messages and calls are end-to-end encrypted", re.I),
    re.compile(r"joined using a group link", re.I),
    re.compile(r"created group", re.I),
)

EDITED_SUFFIX = re.compile(r"\s*<This message was edited>\s*$", re.I)


def parse_chat(path: Path) -> list[dict]:
    """Return list of {name, text} dicts. Phone numbers kept as-is (VCF mapping is a later step)."""
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
                text = EDITED_SUFFIX.sub("", m.group(3).strip())

                if any(p.search(text) for p in SKIP_PATTERNS):
                    current = None
                    continue
                if any(p.search(name) for p in SKIP_PATTERNS):
                    current = None
                    continue

                current = {"name": name, "text": text}
            elif current and line:
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
                        "place_name":          {"type": "string",  "description": "שם המקום, הרופא/ה, או נותן השירות"},
                        "category":            {"type": "string",  "enum": ["doctor", "cafe", "food", "cosmetics", "attraction", "kids"]},
                        "address_hint":        {"type": "string",  "description": "כתובת חלקית אם מוזכרת, אחרת null"},
                        "recommendation_text": {"type": "string",  "description": "הטקסט המקורי שכתב השולח"},
                        "reviewer_name":       {"type": "string",  "description": "שם השולח (מהשדה name) — כולל מספרי טלפון"},
                        "enthusiasm":          {"type": "string",  "enum": ["high", "medium", "negative"],
                                                "description": "high=ממליץ בחום, medium=ממליץ, negative=לא ממליץ"},
                        "source_messages":     {"type": "array", "items": {"type": "string"},
                                                "description": "העתק מילולי של הודעות השאלה שגרמו להמלצה הזו (אם יש). ריק אם ההמלצה עצמאית."},
                    },
                    "required": ["place_name", "category", "recommendation_text", "reviewer_name", "enthusiasm"],
                },
            }
        },
        "required": ["recommendations"],
    },
}

SYSTEM_PROMPT = """אתה מנתח שיחות WhatsApp בעברית ומחפש המלצות על מקומות ואנשי מקצוע בגבעתיים.

המטרה: לאסוף את כל ההמלצות האפשריות — עדיף לכלול יותר מדי מאשר לפספס המלצה אמיתית. נסנן ונקטלג מחדש בשלב מאוחר יותר.

חוקים:
1. חלץ כל הודעה שמכילה שם ספציפי של מקום, עסק, רופא/ה, מספרת, או נותן שירות — גם אם ההמלצה קצרה או לא מפורטת.
2. שאלות ותשובות: אם מישהי שאלה "מישהי מכירה X טוב/ה?" — כל הודעה בבאצ' הזה שמזכירה שם ספציפי כתשובה לנושא הזה היא המלצה, גם אם היא מגיעה הרבה הודעות אחרי השאלה. אין לדרוש שהתשובה תהיה מיד אחרי השאלה.
3. התעלם רק מ: שיחות שאין בהן שם ספציפי כלל (לוגיסטיקה, "תודה", "אני גם מחפשת", אמוג'ים בלבד, תיאומים, מידע על כלל הקהילה).
4. אם ההמלצה מזכירה שם ספציפי של אדם (כגון רופא/ה) — השתמש בשם זה כ-place_name.
5. recommendation_text — העתק את טקסט ההודעה המקורית כמו שהיא, ללא שינויים.
6. reviewer_name — העתק את השם בדיוק כפי שמופיע, כולל מספרי טלפון.
7. אם אתה לא בטוח אם זו המלצה — כלול אותה. עדיף false positive.

קטגוריות:
- doctor: רופאים, מומחים, פיזיותרפיסטים, שירותי בריאות
- cafe: בתי קפה
- food: מסעדות, אוכל, משלוחים
- cosmetics: קוסמטיקה, יופי, ציפורניים, שיער, עיסוי
- attraction: אטרקציות, בילויים, מוזיאונים
- kids: פעילויות ילדים, גנים, חוגים"""


def extract_recommendations(client: openai.OpenAI, messages: list[dict]) -> list[dict]:
    """Send a chunk of messages to OpenAI and return extracted recommendations."""
    batch_text = "\n".join(f"[{m['name']}]: {m['text']}" for m in messages)

    tool = {
        "type": "function",
        "function": {
            "name": EXTRACT_TOOL["name"],
            "description": EXTRACT_TOOL["description"],
            "parameters": EXTRACT_TOOL["input_schema"],
        },
    }

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"הודעות לניתוח:\n\n{batch_text}"},
        ],
        tools=[tool],
        tool_choice={"type": "function", "function": {"name": "extract_recommendations"}},
    )

    tool_calls = response.choices[0].message.tool_calls
    if tool_calls:
        return json.loads(tool_calls[0].function.arguments).get("recommendations", [])

    return []


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def find_place_by_name(supabase, name: str) -> str | None:
    """Return existing place UUID if a place with this name already exists."""
    result = supabase.table("places").select("id").ilike("name", name).limit(1).execute()
    rows = result.data or []
    return rows[0]["id"] if rows else None


def upsert_staging(supabase, rec: dict, source_file: str) -> str:
    """
    Insert a new staging row, or if (place_name, reviewer_name) already exists,
    update source_messages only — leaving category/status/admin edits untouched.
    Returns "inserted" or "updated".
    """
    existing_place_id = find_place_by_name(supabase, rec["place_name"])
    source_msgs = rec.get("source_messages") or []

    try:
        supabase.table("whatsapp_import_staging").insert({
            "place_name":          rec["place_name"],
            "category":            rec["category"],
            "address_hint":        rec.get("address_hint") or None,
            "recommendation_text": rec["recommendation_text"],
            "reviewer_name":       rec["reviewer_name"],
            "enthusiasm":          rec["enthusiasm"],
            "source_file":         source_file,
            "source_messages":     source_msgs if source_msgs else None,
            "existing_place_id":   existing_place_id,
        }).execute()
        return "inserted"
    except Exception as e:
        if "duplicate" not in str(e).lower() and "unique" not in str(e).lower():
            raise
        # Row exists — update only source_messages, preserving category and all admin edits
        supabase.table("whatsapp_import_staging").update({
            "source_messages": source_msgs if source_msgs else None,
        }).eq("place_name", rec["place_name"]).eq("reviewer_name", rec["reviewer_name"]).execute()
        return "updated"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    chat_files: list[str],
    dry_run: bool = False,
    overlap: int = DEFAULT_OVERLAP,
    max_chunks: int | None = None,
) -> int:
    """
    Parse WhatsApp .txt files and stage recommendations for human review.

    Args:
        chat_files: paths to WhatsApp .txt export files
        dry_run:    print extracted recommendations without writing to DB
        overlap:    messages repeated between consecutive chunks (default 30)
                    keeps question→answer threads from being split at boundaries
        max_chunks: stop after this many chunks per file (None = all).
                    *** SET TO None (or remove) TO PROCESS THE FULL FILE. ***
                    Use a small number (e.g. 3) for test runs to limit API cost.
    """
    if not chat_files:
        print("Usage: python parse_whatsapp.py chat1.txt [chat2.txt ...] [--dry-run] [--max-chunks=N]")
        return 1

    if not dry_run and (not SUPABASE_URL or not SUPABASE_KEY):
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    if not OPENAI_KEY:
        print("ERROR: Set OPENAI_API_KEY in .env.local")
        return 1

    supabase = None if dry_run else create_client(SUPABASE_URL, SUPABASE_KEY)
    claude = openai.OpenAI(api_key=OPENAI_KEY)

    # In-memory dedup — skips exact (place_name, reviewer_name) pairs seen this run
    # (catches duplicates from chunk overlap before hitting the DB unique constraint)
    seen: set[tuple[str, str]] = set()

    step = max(1, CHUNK_SIZE - overlap)
    staged = updated = errors = 0

    for chat_path_str in chat_files:
        chat_path = Path(chat_path_str)
        if not chat_path.exists():
            print(f"File not found: {chat_path}", file=sys.stderr)
            continue

        print(f"\nParsing {chat_path.name}...")
        messages = parse_chat(chat_path)
        total_chunks = max(1, (len(messages) + step - 1) // step)
        capped = max_chunks is not None and max_chunks < total_chunks
        run_chunks = min(max_chunks, total_chunks) if max_chunks is not None else total_chunks
        print(f"  {len(messages)} messages → {total_chunks} total chunks (size={CHUNK_SIZE}, overlap={overlap})")
        if capped:
            print(f"  ⚠️  Running only first {run_chunks} chunks (max_chunks={max_chunks}).")
            print(f"     To process the full file: set max_chunks=None in the VSCode debug block")
            print(f"     or remove --max-chunks from the command line.")

        chunk_num = 0
        for i in range(0, len(messages), step):
            if max_chunks is not None and chunk_num >= max_chunks:
                break
            chunk_num += 1
            chunk = messages[i : i + CHUNK_SIZE]
            print(f"  Chunk {chunk_num}/{run_chunks} (msgs {i+1}–{i+len(chunk)})...", end=" ", flush=True)

            try:
                recs = extract_recommendations(claude, chunk)
                print(f"{len(recs)} found")
            except Exception as e:
                print(f"ERROR: {e}", file=sys.stderr)
                errors += 1
                time.sleep(1)
                continue

            for rec in recs:
                key = (rec["place_name"].strip().lower(), rec["reviewer_name"].strip().lower())
                if key in seen:
                    continue
                seen.add(key)

                icon = {"high": "⭐⭐⭐⭐⭐", "medium": "⭐⭐⭐⭐", "negative": "⭐⭐"}.get(rec["enthusiasm"], "?")

                if dry_run:
                    src = f" ← {rec['source_messages'][0][:60]}…" if rec.get("source_messages") else ""
                    print(f"    {icon} [{rec['category']:12}] {rec['place_name']} — {rec['reviewer_name']}")
                    print(f"       {rec['recommendation_text'][:120]}{src}")
                else:
                    try:
                        result = upsert_staging(supabase, rec, chat_path.name)
                        if result == "inserted":
                            staged += 1
                            print(f"    {icon} new:     {rec['place_name']} ({rec['category']}) by {rec['reviewer_name']}")
                        else:
                            updated += 1
                            print(f"    {icon} updated: {rec['place_name']} — source_messages refreshed")
                    except Exception as e:
                        print(f"    ERROR upserting {rec['place_name']}: {e}", file=sys.stderr)
                        errors += 1

            time.sleep(0.5)  # rate limit

    if dry_run:
        print(f"\nDry run complete — {len(seen)} unique recommendations found")
    else:
        print(f"\nDone: {staged} new, {updated} updated (source_messages), {errors} errors")
        print("→ Run merge_staging.py, then review at /admin/whatsapp")

    return 0


if __name__ == "__main__":
    files = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    max_c = None
    for arg in sys.argv[1:]:
        if arg.startswith("--max-chunks="):
            try:
                max_c = int(arg.split("=", 1)[1])
            except ValueError:
                pass
    sys.exit(main(files, dry_run=dry, max_chunks=max_c))


# ---------------------------------------------------------------------------
# VSCode debug — edit paths and uncomment to run directly.
#
# max_chunks=3 limits to the first 3 chunks (~180 messages) for a cheap test.
# Change to max_chunks=None to process the entire file.
# ---------------------------------------------------------------------------
# main(
#     chat_files=["C:/path/to/your/chat.txt"],
#     dry_run=True,
#     max_chunks=3,   # ← remove or set to None for a full run
# )
