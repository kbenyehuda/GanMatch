#!/usr/bin/env python3
"""
Enrich source_messages for WhatsApp staging rows using a focused LLM call.

For each staging row in the given category, finds the recommendation in the
original chat file, collects up to 30 preceding messages, and asks an LLM to
identify which message(s) prompted the recommendation.

Results are stored back in source_messages (best candidate first, reasoning prepended).
Rows the LLM flags as "not a recommendation" are logged but not auto-rejected.

Usage:
  python enrich_source_questions.py chat.txt --category=doctor [--dry-run] [--max-rows=N]

  --category=<cat>  Category to process (default: doctor)
  --dry-run         Find matches and print stats without calling the LLM or writing to DB
  --max-rows=N      Stop after N rows (for test runs)
"""

import json
import os
import re
import sys
import time
from difflib import SequenceMatcher
from pathlib import Path

# Force UTF-8 stdout/stderr on Windows (default cp1255 can't encode all Hebrew/Arabic chars)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from dotenv import load_dotenv
from supabase import create_client
import openai

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

OPENAI_MODEL = "gpt-4o-mini"
CONTEXT_WINDOW = 30     # messages before the recommendation to include
FUZZY_THRESHOLD = 0.5   # minimum similarity ratio to consider a chat message a match


# ---------------------------------------------------------------------------
# Chat parser (identical logic to parse_whatsapp.py)
# ---------------------------------------------------------------------------

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
# Fuzzy matching — find a recommendation message in the full chat
# ---------------------------------------------------------------------------

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def find_message_index(messages: list[dict], reviewer_name: str, recommendation_text: str) -> tuple[int | None, float, str | None]:
    """
    Return (index, best_score, best_text) of the best-matching chat message.
    index is None if no match found above threshold.
    best_text is the closest message text found (even if below threshold), for diagnostics.

    Matching priority:
    1. Exact substring containment (score=1.0) — rec text fully inside chat message
    2. Fuzzy SequenceMatcher ratio >= FUZZY_THRESHOLD
    """
    best_idx = None
    best_score = 0.0
    best_text = None

    reviewer_lower = reviewer_name.lower()
    rec_lower = recommendation_text.lower()

    def name_matches(chat_name: str) -> bool:
        """Exact match, or one string fully contains the other (handles RTL marks, formatting noise)."""
        cn = chat_name.lower()
        return cn == reviewer_lower or reviewer_lower in cn or cn in reviewer_lower

    # First pass: match by name
    name_matched = False
    for i, msg in enumerate(messages):
        if not name_matches(msg["name"]):
            continue
        name_matched = True
        msg_lower = msg["text"].lower()

        if rec_lower in msg_lower:
            return i, 1.0, msg["text"]

        score = similarity(msg["text"], recommendation_text)
        if score > best_score:
            best_score = score
            best_idx = i
            best_text = msg["text"]

    if name_matched:
        return (best_idx if best_score >= FUZZY_THRESHOLD else None), best_score, best_text

    # Second pass: name not found — try text-only match across all messages
    for i, msg in enumerate(messages):
        msg_lower = msg["text"].lower()
        if rec_lower in msg_lower:
            return i, 1.0, msg["text"]
        score = similarity(msg["text"], recommendation_text)
        if score > best_score:
            best_score = score
            best_idx = i
            best_text = msg["text"]

    return (best_idx if best_score >= FUZZY_THRESHOLD else None), best_score, best_text


# ---------------------------------------------------------------------------
# LLM enrichment
# ---------------------------------------------------------------------------

ENRICH_TOOL = {
    "type": "function",
    "function": {
        "name": "identify_source_question",
        "description": "Identify which preceding message(s) prompted a WhatsApp recommendation.",
        "parameters": {
            "type": "object",
            "properties": {
                "candidates": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Exact text of the message(s) that prompted the recommendation, "
                        "ordered from most to least likely. Empty if spontaneous."
                    ),
                },
                "is_spontaneous": {
                    "type": "boolean",
                    "description": "True if the recommendation was given spontaneously with no matching question in the window.",
                },
                "not_a_recommendation": {
                    "type": "boolean",
                    "description": "True if this message doesn't appear to be a real recommendation for a place or service.",
                },
                "reasoning": {
                    "type": "string",
                    "description": "One short sentence in Hebrew explaining the choice.",
                },
                "suggested_category": {
                    "type": "string",
                    "enum": ["doctor", "cafe", "food", "cosmetics", "attraction", "kids", "clinic"],
                    "description": (
                        "If the source question clearly belongs to a different category than the current one "
                        "(e.g. the question is about kindergartens but the rec is filed as doctor), "
                        "return the better-fitting category. Omit or return null if the category looks correct."
                    ),
                },
            },
            "required": ["candidates", "is_spontaneous", "not_a_recommendation", "reasoning"],
        },
    },
}

SYSTEM_PROMPT = (
    "אתה מנתח שיחות WhatsApp בעברית של קבוצת שכונה בגבעתיים.\n"
    "המשימה שלך: לזהות איזו הודעה בשיחה גרמה לאדם מסוים להמליץ על רופא/ה או שירות רפואי."
)


def enrich_source_question(
    client: openai.OpenAI,
    reviewer_name: str,
    recommendation_text: str,
    preceding: list[dict],
) -> dict:
    numbered = "\n".join(f"{i+1}. [{m['name']}]: {m['text']}" for i, m in enumerate(preceding))

    user_content = f"""להלן המלצה שחולצה משיחת WhatsApp:

ממליץ/ה: {reviewer_name}
טקסט ההמלצה: {recommendation_text}

להלן עד {len(preceding)} ההודעות שקדמו להמלצה (מהישנה לחדשה):
{numbered}

המשימה:
- עיין/י בהודעות שלפני ההמלצה וזהה/י אילו הודעות היו ככל הנראה השאלה/הבקשה שגרמה להמלצה.
- הממליץ/ה אולי הגיב/ה לשאלה ישנה שנשאלה הרבה הודעות קודם — חפש/י בכל הטווח.
- בחר/י עד 3 מועמדים, מהסביר ביותר לפחות סביר. העתק/י את הטקסט המקורי המדויק.
- אם ההמלצה ניתנה באופן ספונטני (אין שאלה מתאימה בחלון) — ציין זאת.
- אם לדעתך ההודעה אינה המלצה אמיתית (לוגיסטיקה, תגובה לא קשורה, אמוג'י בלבד) — ציין זאת."""

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        tools=[ENRICH_TOOL],
        tool_choice={"type": "function", "function": {"name": "identify_source_question"}},
    )

    tool_calls = response.choices[0].message.tool_calls
    if tool_calls:
        return json.loads(tool_calls[0].function.arguments)
    return {"candidates": [], "is_spontaneous": True, "not_a_recommendation": False, "reasoning": "no tool call returned"}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    chat_file: str,
    category: str = "doctor",
    dry_run: bool = False,
    max_rows: int | None = None,
) -> int:
    if not chat_file:
        print("Usage: python enrich_source_questions.py chat.txt --category=<cat> [--dry-run] [--max-rows=N]")
        return 1

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    if not dry_run and not OPENAI_KEY:
        print("ERROR: Set OPENAI_API_KEY in .env.local")
        return 1

    chat_path = Path(chat_file)
    if not chat_path.exists():
        print(f"ERROR: Chat file not found: {chat_path}")
        return 1

    print(f"Parsing {chat_path.name}...")
    messages = parse_chat(chat_path)
    print(f"  {len(messages)} messages loaded.")

    db = create_client(SUPABASE_URL, SUPABASE_KEY)
    client = openai.OpenAI(api_key=OPENAI_KEY) if not dry_run else None

    print(f"\nLoading staging rows for category='{category}'...")
    rows = (
        db.table("whatsapp_import_staging")
        .select("id, place_name, reviewer_name, recommendation_text, source_messages")
        .eq("category", category)
        .limit(max_rows or 10_000)
        .execute()
        .data or []
    )
    print(f"  {len(rows)} rows to process.")

    not_found = enriched = spontaneous = flagged = errors = cat_mismatches = 0
    no_name_match = 0

    for row in rows:
        row_id = row["id"]
        reviewer = row["reviewer_name"]
        rec_text = row["recommendation_text"]
        place = row["place_name"]

        idx, score, best_text = find_message_index(messages, reviewer, rec_text)
        if idx is None:
            not_found += 1
            if dry_run:
                if best_text is None:
                    # Reviewer name not found at all in chat
                    no_name_match += 1
                    print(f"  [no name] {place[:35]} | reviewer: {reviewer[:40]}")
                else:
                    # Name found but text similarity too low
                    print(f"  [low {score:.2f}] {place[:35]} | rec: {rec_text[:60]}")
                    print(f"             best chat msg: {best_text[:80]}")
            continue

        preceding = messages[max(0, idx - CONTEXT_WINDOW) : idx]

        if dry_run:
            print(f"  [ok {score:.2f}] {place[:40]} (chat idx={idx}, {len(preceding)} preceding msgs)")
            continue

        try:
            result = enrich_source_question(client, reviewer, rec_text, preceding)
        except Exception as e:
            print(f"  ERROR on {place}: {e}", file=sys.stderr)
            errors += 1
            time.sleep(1)
            continue

        candidates = result.get("candidates") or []
        reasoning = result.get("reasoning") or ""
        is_spont = result.get("is_spontaneous", False)
        not_a_rec = result.get("not_a_recommendation", False)
        suggested_cat = result.get("suggested_category") or ""

        # Drop candidates that are essentially identical to the recommendation itself
        rec_lower = rec_text.lower()
        filtered_candidates = [c for c in candidates if similarity(c, rec_text) < 0.8]
        identical_dropped = len(candidates) - len(filtered_candidates)
        candidates = filtered_candidates

        # Build warning flags
        flags: list[str] = []
        if identical_dropped:
            flags.append("[⚠ שאלת מקור זהה להמלצה]")
        if suggested_cat and suggested_cat != category:
            flags.append(f"[⚠ שאלת המקור עשויה להיות: {suggested_cat}]")
            cat_mismatches += 1

        if not_a_rec:
            print(f"  [!] NOT A REC:  {place[:40]} - {reasoning}")
            flagged += 1
        elif is_spont or not candidates:
            label = "[זהה]" if identical_dropped else "[~]"
            print(f"  {label} spontaneous: {place[:40]} - {reasoning}")
            spontaneous += 1
        else:
            cat_warn = f" CAT={suggested_cat}" if suggested_cat and suggested_cat != category else ""
            print(f"  [ok] {place[:40]}: {len(candidates)} candidate(s){cat_warn} - {reasoning}")
            enriched += 1

        # Flags first, then reasoning, then candidates (best first)
        new_source = flags + ([f"[{reasoning}]"] if reasoning else []) + candidates

        db.table("whatsapp_import_staging").update({
            "source_messages": new_source or None,
        }).eq("id", row_id).execute()

        time.sleep(0.3)  # rate limit

    if dry_run:
        text_miss = not_found - no_name_match
        print(f"\nDry run: {len(rows) - not_found}/{len(rows)} matched ({(len(rows)-not_found)/max(len(rows),1)*100:.1f}%)")
        print(f"  Not found: {not_found} total — {no_name_match} reviewer name absent from chat, {text_miss} name found but text similarity < {FUZZY_THRESHOLD}")
    else:
        print(
            f"\nDone: {enriched} enriched, {spontaneous} spontaneous, "
            f"{flagged} flagged not-a-rec, {cat_mismatches} category mismatches, "
            f"{not_found} not found in chat, {errors} errors"
        )
    return 0


if __name__ == "__main__":
    positional = [a for a in sys.argv[1:] if not a.startswith("--")]
    chat_file_arg = positional[0] if positional else ""

    category_arg = "doctor"
    dry_run_arg = "--dry-run" in sys.argv
    max_rows_arg = None

    for a in sys.argv[1:]:
        if a.startswith("--category="):
            category_arg = a.split("=", 1)[1]
        elif a.startswith("--max-rows="):
            try:
                max_rows_arg = int(a.split("=", 1)[1])
            except ValueError:
                pass

    sys.exit(main(chat_file_arg, category_arg, dry_run_arg, max_rows_arg))


# ---------------------------------------------------------------------------
# VSCode debug — edit paths and uncomment to run directly.
# ---------------------------------------------------------------------------
# main(
#     chat_file="C:/path/to/your/chat.txt",
#     category="doctor",
#     dry_run=True,
#     max_rows=10,
# )
