#!/usr/bin/env python3
"""
Enrich whatsapp_import_staging rows with structured fields:
  specialty, hmo, for_children

Reads all pending staging rows where category is in the target list
AND specialty IS NULL, then calls OpenAI to fill in the fields.

DO NOT RUN until the triage UI review is complete.
Run AFTER manually reviewing/editing staging rows in /admin/whatsapp.

Usage:
  python enrich_staging.py [--dry-run] [--max-rows=N] [--categories=doctor,cosmetics]

Credentials loaded from root .env.local.
"""

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client
import openai

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")

OPENAI_MODEL = "gpt-4o-mini"
HMO_OPTIONS = ["מכבי", "כללית", "מאוחדת", "לאומית"]
DEFAULT_CATEGORIES = ["doctor", "clinic", "cosmetics"]


# ---------------------------------------------------------------------------
# OpenAI extraction
# ---------------------------------------------------------------------------

ENRICH_TOOL = {
    "type": "function",
    "function": {
        "name": "enrich_recommendation",
        "description": "Extract structured sub-category fields from a community place recommendation.",
        "parameters": {
            "type": "object",
            "properties": {
                "specialty": {
                    "type": "string",
                    "description": (
                        "The specific specialty of the recommended place or professional. "
                        "Use one of the known specialties from the list if it fits. "
                        "If a clearly different specialty is mentioned, write it in Hebrew. "
                        "Empty string if no specialty is discernible."
                    ),
                },
                "hmo": {
                    "type": "array",
                    "items": {"type": "string", "enum": HMO_OPTIONS},
                    "description": (
                        "Health maintenance organizations (קופות חולים) explicitly mentioned "
                        "in the recommendation. Empty array if none mentioned."
                    ),
                },
                "for_children": {
                    "type": "boolean",
                    "description": (
                        "True if the recommendation is clearly for children (e.g. pediatrician, "
                        "children's dentist). False if clearly for adults only. "
                        "Omit the field (null) if unclear or works for all ages."
                    ),
                },
            },
            "required": ["specialty", "hmo"],
        },
    },
}


def build_prompt(row: dict, known_specialties: list[str]) -> str:
    parts = []
    if known_specialties:
        parts.append(f"רשימת התמחויות ידועות לקטגוריה '{row['category']}': {', '.join(known_specialties)}")
    parts.append(f"שם המקום/הממליץ: {row['place_name']}")
    if row.get("source_messages"):
        questions = "\n".join(f"  - {m}" for m in row["source_messages"])
        parts.append(f"שאלות שגרמו להמלצה:\n{questions}")
    parts.append(f"טקסט ההמלצה:\n{row['recommendation_text']}")
    return "\n\n".join(parts)


def enrich_row(client: openai.OpenAI, row: dict, known_specialties: list[str], dry_run: bool) -> dict | None:
    prompt = build_prompt(row, known_specialties)

    if dry_run:
        print(f"  [DRY RUN] would call OpenAI for: {row['place_name']!r}")
        return None

    try:
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "אתה מומחה בניתוח המלצות קהילתיות. "
                        "חלץ שדות מובנים מהמלצה נתונה. "
                        "השתמש בעברית. ענה רק דרך הכלי."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            tools=[ENRICH_TOOL],
            tool_choice={"type": "function", "function": {"name": "enrich_recommendation"}},
            temperature=0,
        )
        tool_call = response.choices[0].message.tool_calls[0]
        return json.loads(tool_call.function.arguments)
    except Exception as e:
        print(f"  ERROR calling OpenAI: {e}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(dry_run: bool = False, max_rows: int | None = None, categories: list[str] | None = None):
    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("Missing Supabase credentials in .env.local")
    if not OPENAI_KEY:
        sys.exit("Missing OPENAI_API_KEY in .env.local")

    target_categories = categories or DEFAULT_CATEGORIES
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    oai = openai.OpenAI(api_key=OPENAI_KEY)

    # Fetch taxonomy
    taxonomy_resp = sb.table("specialty_taxonomy").select("category, name").execute()
    taxonomy: dict[str, list[str]] = {}
    for row in taxonomy_resp.data or []:
        taxonomy.setdefault(row["category"], []).append(row["name"])
    print(f"Loaded taxonomy: {sum(len(v) for v in taxonomy.values())} specialties across {len(taxonomy)} categories")

    # Fetch pending rows to enrich
    query = (
        sb.table("whatsapp_import_staging")
        .select("id, place_name, category, recommendation_text, source_messages")
        .eq("status", "pending")
        .in_("category", target_categories)
        .is_("specialty", "null")
        .order("created_at")
    )
    if max_rows:
        query = query.limit(max_rows)

    rows = (query.execute().data) or []
    print(f"Found {len(rows)} rows to enrich (categories: {', '.join(target_categories)})")

    if not rows:
        print("Nothing to do.")
        return

    updated = 0
    new_specialties_added = 0
    errors = 0

    for i, row in enumerate(rows):
        cat = row["category"]
        known = taxonomy.get(cat, [])
        print(f"[{i + 1}/{len(rows)}] {row['place_name']!r} ({cat})")

        result = enrich_row(oai, row, known, dry_run)
        if result is None:
            if not dry_run:
                errors += 1
            continue

        specialty = (result.get("specialty") or "").strip()
        hmo = [h for h in (result.get("hmo") or []) if h in HMO_OPTIONS]
        for_children = result.get("for_children")  # bool or None

        print(f"  specialty={specialty!r} hmo={hmo} for_children={for_children}")

        # If specialty is new, add it to taxonomy
        if specialty and specialty not in taxonomy.get(cat, []):
            if not dry_run:
                try:
                    sb.table("specialty_taxonomy").upsert(
                        {"category": cat, "name": specialty},
                        on_conflict="category,name",
                    ).execute()
                    taxonomy.setdefault(cat, []).append(specialty)
                    new_specialties_added += 1
                    print(f"  + Added new specialty '{specialty}' to taxonomy")
                except Exception as e:
                    print(f"  WARNING: could not insert taxonomy entry: {e}", file=sys.stderr)
            else:
                print(f"  [DRY RUN] would add new specialty '{specialty}' to taxonomy")

        # Update staging row
        if not dry_run:
            update: dict = {}
            if specialty:
                update["specialty"] = specialty
            if hmo:
                update["hmo"] = hmo
            if for_children is not None:
                update["for_children"] = for_children
            if update:
                try:
                    sb.table("whatsapp_import_staging").update(update).eq("id", row["id"]).execute()
                    updated += 1
                except Exception as e:
                    print(f"  ERROR updating row {row['id']}: {e}", file=sys.stderr)
                    errors += 1

    print(f"\nDone. updated={updated} new_specialties={new_specialties_added} errors={errors}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich staging rows with specialty/hmo/for_children via LLM.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done without writing to DB or calling OpenAI.")
    parser.add_argument("--max-rows", type=int, default=None, metavar="N", help="Process only first N rows.")
    parser.add_argument("--categories", type=str, default=None, metavar="cat1,cat2", help="Comma-separated categories (default: doctor,clinic,cosmetics).")
    args = parser.parse_args()

    cats = [c.strip() for c in args.categories.split(",")] if args.categories else None
    main(dry_run=args.dry_run, max_rows=args.max_rows, categories=cats)
