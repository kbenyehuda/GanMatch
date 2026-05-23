#!/usr/bin/env python3
"""
Fuzzy-merge similar records in whatsapp_import_staging.

Finds pending records with similar place_name within the same category and
assigns a shared merge_group_id so the review UI surfaces them together.
After running, go to /admin/whatsapp to review the groups.

Usage:
  python merge_staging.py [--dry-run] [--min-similarity=0.82]

Credentials loaded from root .env.local.
"""

import os
import sys
import uuid
from difflib import SequenceMatcher
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env.local")

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY")


# ---------------------------------------------------------------------------
# Similarity
# ---------------------------------------------------------------------------

def similarity(a: str, b: str) -> float:
    """Normalized similarity between two strings (0–1), case-insensitive."""
    return SequenceMatcher(None, a.strip().lower(), b.strip().lower()).ratio()


def find_groups(records: list[dict], min_sim: float) -> list[list[str]]:
    """
    Single-linkage clustering on place_name within a category.
    Returns groups of 2+ record IDs that likely refer to the same place.
    """
    clusters: list[list[tuple[str, str]]] = []  # list of [(id, name)]

    for rec in records:
        name = rec["place_name"]
        rid = rec["id"]
        placed = False
        for cluster in clusters:
            if any(similarity(name, cname) >= min_sim for _, cname in cluster):
                cluster.append((rid, name))
                placed = True
                break
        if not placed:
            clusters.append([(rid, name)])

    return [[rid for rid, _ in c] for c in clusters if len(c) >= 2]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    dry_run: bool = False,
    min_similarity: float = 0.82,
) -> int:
    """
    Assign merge_group_id to staging records that likely refer to the same place.

    Args:
        dry_run:        print proposed groups without writing to DB
        min_similarity: 0–1 similarity threshold (default 0.82)
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local")
        return 1

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    result = (
        supabase.table("whatsapp_import_staging")
        .select("id,place_name,category,reviewer_name")
        .eq("status", "pending")
        .execute()
    )
    records = result.data or []
    print(f"{len(records)} pending records loaded (threshold={min_similarity})\n")

    # First clear existing merge_group_id on pending records so re-runs are idempotent
    if not dry_run and records:
        ids = [r["id"] for r in records]
        supabase.table("whatsapp_import_staging") \
            .update({"merge_group_id": None}) \
            .in_("id", ids) \
            .execute()

    by_category: dict[str, list[dict]] = {}
    for r in records:
        by_category.setdefault(r["category"], []).append(r)

    total_groups = total_affected = 0

    for category, cat_records in sorted(by_category.items()):
        groups = find_groups(cat_records, min_similarity)
        if not groups:
            print(f"[{category}] no merge groups")
            continue

        print(f"[{category}] {len(groups)} merge group(s):")
        for group_ids in groups:
            names = [r["place_name"] for r in cat_records if r["id"] in group_ids]
            gid = str(uuid.uuid4())
            print(f"  {gid[:8]}... ({len(group_ids)} records):")
            for n in names:
                print(f"    · {n}")

            if not dry_run:
                supabase.table("whatsapp_import_staging") \
                    .update({"merge_group_id": gid}) \
                    .in_("id", group_ids) \
                    .execute()

            total_groups += 1
            total_affected += len(group_ids)

    print()
    if dry_run:
        print(f"Dry run — would create {total_groups} groups affecting {total_affected} records")
    else:
        print(f"Done — {total_groups} groups written, {total_affected} records updated")
        if total_groups:
            print("→ Review merged groups at /admin/whatsapp")

    return 0


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    sim = 0.82
    for arg in sys.argv[1:]:
        if arg.startswith("--min-similarity="):
            try:
                sim = float(arg.split("=", 1)[1])
            except ValueError:
                pass
    sys.exit(main(dry_run=dry, min_similarity=sim))


# ---------------------------------------------------------------------------
# VSCode debug — uncomment to run directly:
# ---------------------------------------------------------------------------
# main(dry_run=True, min_similarity=0.80)
