#!/usr/bin/env python3
"""
Process approved user_inputs and update ganim_v2 + confirmed_reviews.

Handles:
1. suggest_gan     – Create new ganim_v2 rows from approved user suggestions
2. edit            – Merge approved edits into ganim_v2 (last value per field)
3. review          – Upsert approved reviews into confirmed_reviews
4. visit_note      – Upsert approved visit notes into confirmed_reviews
5. waitlist_report – Update vacancy status from approved community reports

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import acreate_client, create_client

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

LOG = logging.getLogger(__name__)

GANIM_FIELDS = [
    "address", "city", "website_url", "category", "maon_symbol_code",
    "private_supervision", "mishpachton_affiliation", "municipal_grade",
    "monthly_price_nis", "min_age_months", "max_age_months", "price_notes",
    "has_cctv", "cctv_streamed_online", "operating_hours", "friday_schedule",
    "meal_type", "vegan_friendly", "vegetarian_friendly", "meat_served",
    "allergy_friendly", "kosher_status", "kosher_certifier", "staff_child_ratio",
    "first_aid_trained", "languages_spoken", "has_outdoor_space", "has_mamad",
    "chugim_types", "vacancy_status",
]

VALID_VACANCY_STATUS = frozenset({"Available", "Limited", "Full", "UNKNOWN"})


def sanitize_category_subfields(payload: dict[str, Any], category: str | None) -> None:
    """Enforce ganim_v2_category_subfields_check: clear subfields that don't apply to category."""
    cat = (category or "").strip().upper() or "UNSPECIFIED"
    if cat != "MAON_SYMBOL":
        payload["maon_symbol_code"] = None
    if cat != "PRIVATE_GAN":
        payload["private_supervision"] = None
    if cat != "MISHPACHTON":
        payload["mishpachton_affiliation"] = None
    if cat != "MUNICIPAL_GAN":
        payload["municipal_grade"] = None


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    root = repo_root()
    load_dotenv(root / ".env")
    load_dotenv(root / ".env.local", override=True)


def env_trim(name: str) -> str | None:
    v = os.getenv(name)
    if not v:
        return None
    return v.strip() or None


def require_env(name: str) -> str:
    v = env_trim(name)
    if not v:
        raise RuntimeError(f"Missing required env: {name}")
    return v


def last_per_field(rows: list[dict[str, Any]], fields: list[str]) -> dict[str, Any]:
    """For each field, take the last non-null value (by created_at)."""
    result: dict[str, Any] = {}
    sorted_rows = sorted(rows, key=lambda r: r.get("created_at") or "")
    for row in sorted_rows:
        for f in fields:
            v = row.get(f)
            if v is not None:
                result[f] = v
    return result


def merge_metadata(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge metadata from rows - last non-null wins per key."""
    result: dict[str, Any] = {}
    sorted_rows = sorted(rows, key=lambda r: r.get("created_at") or "")
    for row in sorted_rows:
        m = row.get("metadata")
        if isinstance(m, dict):
            for k, v in m.items():
                if v is not None:
                    result[k] = v
    return result


# -----------------------------------------------------------------------------
# Processors
# -----------------------------------------------------------------------------


def process_edits(supabase: Any, dry_run: bool) -> int:
    """Process edit inputs: merge into ganim_v2."""
    r = (
        supabase.table("user_inputs")
        .select("*")
        .eq("input_type", "edit")
        .eq("status", "approved")
        .not_.is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    by_gan: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        gid = row.get("gan_id")
        if gid:
            by_gan[str(gid)].append(row)

    updated = 0
    for gan_id, inputs in by_gan.items():
        merged = last_per_field(inputs, GANIM_FIELDS)
        meta = merge_metadata(inputs)
        if not merged and not meta:
            continue
        payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
        payload.update(merged)
        if not dry_run:
            ex = supabase.table("ganim_v2").select("metadata", "category").eq("id", gan_id).single().execute()
            row_data = ex.data or {}
            payload.setdefault("category", row_data.get("category"))
            if meta:
                base = row_data.get("metadata") or {}
                if isinstance(base, dict):
                    meta = {**base, **meta}
        if meta:
            payload["metadata"] = meta
        sanitize_category_subfields(payload, payload.get("category"))
        if not dry_run:
            supabase.table("ganim_v2").update(payload).eq("id", gan_id).execute()
        updated += 1
    return updated


def process_suggest_gan(supabase: Any, dry_run: bool) -> int:
    """Process suggest_gan inputs: create new ganim_v2 rows."""
    r = (
        supabase.table("user_inputs")
        .select("*")
        .eq("input_type", "suggest_gan")
        .eq("status", "approved")
        .is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    created = 0
    for row in rows:
        name_he = row.get("name_he")
        lat = row.get("lat")
        lon = row.get("lon")
        if not name_he or lat is None or lon is None:
            LOG.warning("Skipping suggest_gan id=%s: missing name_he, lat, or lon", row.get("id"))
            continue
        gan_id = uuid.uuid4()
        meta = row.get("metadata") or {}
        category = row.get("category") or "UNSPECIFIED"
        maon = row.get("maon_symbol_code") if category == "MAON_SYMBOL" else None
        if not dry_run:
            supabase.rpc(
                "upsert_ganim_v2",
                {
                    "p_id": str(gan_id),
                    "p_name_he": name_he,
                    "p_lon": float(lon),
                    "p_lat": float(lat),
                    "p_address": row.get("address"),
                    "p_city": row.get("city"),
                    "p_category": category,
                    "p_maon_symbol_code": maon,
                    # This path now processes only approved suggestions.
                    "p_is_verified": True,
                    "p_metadata": meta,
                    "p_is_fallback": False,
                },
            ).execute()
            extra: dict[str, Any] = {
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "website_url": row.get("website_url"),
                "has_cctv": row.get("has_cctv") if row.get("has_cctv") is not None else False,
                "cctv_streamed_online": row.get("cctv_streamed_online"),
                "monthly_price_nis": row.get("monthly_price_nis"),
                "min_age_months": row.get("min_age_months"),
                "max_age_months": row.get("max_age_months"),
                "price_notes": row.get("price_notes"),
                "operating_hours": row.get("operating_hours"),
                "friday_schedule": row.get("friday_schedule"),
                "meal_type": row.get("meal_type"),
                "vegan_friendly": row.get("vegan_friendly"),
                "vegetarian_friendly": row.get("vegetarian_friendly"),
                "meat_served": row.get("meat_served"),
                "allergy_friendly": row.get("allergy_friendly"),
                "kosher_status": row.get("kosher_status"),
                "kosher_certifier": row.get("kosher_certifier"),
                "staff_child_ratio": row.get("staff_child_ratio"),
                "first_aid_trained": row.get("first_aid_trained"),
                "languages_spoken": row.get("languages_spoken"),
                "has_outdoor_space": row.get("has_outdoor_space"),
                "has_mamad": row.get("has_mamad"),
                "chugim_types": row.get("chugim_types"),
                "vacancy_status": row.get("vacancy_status"),
                "private_supervision": row.get("private_supervision"),
                "mishpachton_affiliation": row.get("mishpachton_affiliation"),
                "municipal_grade": row.get("municipal_grade"),
            }
            update_payload = {k: v for k, v in extra.items() if v is not None or k in ("has_cctv", "updated_at")}
            sanitize_category_subfields(update_payload, category)
            supabase.table("ganim_v2").update(update_payload).eq("id", str(gan_id)).execute()
            supabase.table("user_inputs").update({"gan_id": str(gan_id)}).eq("id", row["id"]).execute()
        created += 1
    return created


def process_approved_suggest_verifications(supabase: Any, dry_run: bool) -> int:
    """
    Ensure ganim created from approved suggest_gan rows are marked verified.
    This backfills rows created before verification logic was introduced.
    """
    r = (
        supabase.table("user_inputs")
        .select("gan_id")
        .eq("input_type", "suggest_gan")
        .eq("status", "approved")
        .not_.is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    gan_ids = sorted({str(row.get("gan_id")) for row in rows if row.get("gan_id")})
    if not gan_ids:
        return 0

    updated = 0
    for gan_id in gan_ids:
        if not dry_run:
            supabase.table("ganim_v2").update({
                "is_verified": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", gan_id).eq("is_verified", False).execute()
        updated += 1
    return updated


def _row_to_review_payload(row: dict[str, Any], default_rating: float = 3.0) -> dict[str, Any]:
    """Build confirmed_reviews payload from user_inputs row (review or visit_note)."""
    meta = row.get("metadata") or {}
    rating = meta.get("rating")
    if rating is None:
        rating = default_rating
    try:
        rating = float(rating)
    except (TypeError, ValueError):
        rating = default_rating
    return {
        "user_id": row["user_id"],
        "gan_id": row["gan_id"],
        "rating": rating,
        "cleanliness_rating": meta.get("cleanliness_rating"),
        "staff_rating": meta.get("staff_rating"),
        "communication_rating": meta.get("communication_rating"),
        "food_rating": meta.get("food_rating"),
        "location_rating": meta.get("location_rating"),
        "safety_rating": meta.get("safety_rating"),
        "advice_to_parents_text": (row.get("free_text_rec") or "").strip() or None,
        "enrollment_years": meta.get("enrollment_years"),
        "is_anonymous": row.get("anonymous", True),
        "allow_contact": row.get("allows_messages", True),
        "reviewer_public_name": meta.get("reviewer_public_name"),
        "reviewer_public_email_masked": meta.get("reviewer_public_email_masked"),
    }


def process_reviews(supabase: Any, dry_run: bool) -> int:
    """Process review inputs: upsert into confirmed_reviews (full recommendations with ratings)."""
    r = (
        supabase.table("user_inputs")
        .select("*")
        .eq("input_type", "review")
        .eq("status", "approved")
        .not_.is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    inserted = 0
    for row in rows:
        gan_id = row.get("gan_id")
        user_id = row.get("user_id")
        if not gan_id or not user_id:
            LOG.warning("Skipping review id=%s: missing gan_id or user_id", row.get("id"))
            continue
        payload = _row_to_review_payload(row)
        if not dry_run:
            supabase.table("confirmed_reviews").upsert(payload, on_conflict="user_id,gan_id").execute()
        inserted += 1
    return inserted


def process_visit_notes(supabase: Any, dry_run: bool) -> int:
    """Process visit_note inputs: upsert into confirmed_reviews (recommendations with or without text)."""
    r = (
        supabase.table("user_inputs")
        .select("*")
        .eq("input_type", "visit_note")
        .eq("status", "approved")
        .not_.is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    inserted = 0
    for row in rows:
        gan_id = row.get("gan_id")
        user_id = row.get("user_id")
        if not gan_id or not user_id:
            LOG.warning("Skipping visit_note id=%s: missing gan_id or user_id", row.get("id"))
            continue
        payload = _row_to_review_payload(row, default_rating=3.0)
        if not dry_run:
            supabase.table("confirmed_reviews").upsert(payload, on_conflict="user_id,gan_id").execute()
        inserted += 1
    return inserted


def process_waitlist_reports(supabase: Any, dry_run: bool) -> int:
    """Process waitlist_report inputs: update ganim_v2.vacancy_status (last per gan)."""
    r = (
        supabase.table("user_inputs")
        .select("*")
        .eq("input_type", "waitlist_report")
        .eq("status", "approved")
        .not_.is_("gan_id", "null")
        .execute()
    )
    rows = r.data or []
    by_gan: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        gid = row.get("gan_id")
        if gid:
            by_gan[str(gid)].append(row)

    updated = 0
    for gan_id, inputs in by_gan.items():
        sorted_rows = sorted(inputs, key=lambda r: r.get("created_at") or "")
        status = None
        for row in sorted_rows:
            meta = row.get("metadata") or {}
            s = meta.get("status")
            if isinstance(s, str) and s in VALID_VACANCY_STATUS:
                status = s
        if status is None:
            continue
        if not dry_run:
            supabase.table("ganim_v2").update({
                "vacancy_status": status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", gan_id).execute()
        updated += 1
    return updated


def run_once(supabase: Any, dry_run: bool) -> dict[str, int]:
    """Run a single processing pass. Returns counts per type."""
    counts = {
        "verified_suggests": process_approved_suggest_verifications(supabase, dry_run),
        "edits": process_edits(supabase, dry_run),
        "suggests": process_suggest_gan(supabase, dry_run),
        "reviews": process_reviews(supabase, dry_run),
        "visit_notes": process_visit_notes(supabase, dry_run),
        "waitlist_reports": process_waitlist_reports(supabase, dry_run),
    }
    return counts


def format_counts(counts: dict[str, int]) -> str:
    parts = []
    if counts["verified_suggests"]:
        parts.append(f"{counts['verified_suggests']} verified suggested ganim")
    if counts["edits"]:
        parts.append(f"{counts['edits']} gan edits")
    if counts["suggests"]:
        parts.append(f"{counts['suggests']} new ganim")
    if counts["reviews"]:
        parts.append(f"{counts['reviews']} reviews")
    if counts["visit_notes"]:
        parts.append(f"{counts['visit_notes']} visit notes")
    if counts["waitlist_reports"]:
        parts.append(f"{counts['waitlist_reports']} waitlist reports")
    return ", ".join(parts) if parts else "nothing"


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Process user_inputs → ganim_v2, confirmed_reviews")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose logging")
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Run every 60 seconds; also run immediately on startup",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        metavar="SEC",
        help="Seconds between runs when --watch (default: 60)",
    )
    parser.add_argument(
        "--realtime",
        action="store_true",
        help="Listen for user_inputs INSERT/UPDATE via Supabase Realtime; run when relevant",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    url = env_trim("SUPABASE_URL") or env_trim("NEXT_PUBLIC_SUPABASE_URL")
    key = env_trim("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing env vars. Add to .env or .env.local:", file=sys.stderr)
        if not url:
            print("  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", file=sys.stderr)
        if not key:
            print("  SUPABASE_SERVICE_ROLE_KEY (from Supabase Dashboard → Settings → API)", file=sys.stderr)
        sys.exit(1)
    supabase = create_client(url, key)

    mode = " [DRY RUN]" if args.dry_run else ""

    if args.realtime:
        _run_realtime(supabase, args.dry_run, mode)
    elif args.watch:
        print(f"Watching user_inputs (interval={args.interval}s){mode}. Ctrl+C to stop.")
        while True:
            try:
                counts = run_once(supabase, args.dry_run)
                if any(counts.values()):
                    print(f"[{datetime.now(timezone.utc).isoformat()}] Processed{mode}: {format_counts(counts)}")
            except Exception as e:
                LOG.exception("Error during watch run")
                print(f"[{datetime.now(timezone.utc).isoformat()}] Error: {e}")
            time.sleep(args.interval)
    else:
        counts = run_once(supabase, args.dry_run)
        print(f"Processed{mode}: {format_counts(counts)}")


def _run_realtime(sync_supabase: Any, dry_run: bool, mode: str) -> None:
    """Subscribe to user_inputs realtime changes via async client; run processing in thread pool."""
    asyncio.run(_run_realtime_async(sync_supabase, dry_run, mode))


async def _run_realtime_async(sync_supabase: Any, dry_run: bool, mode: str) -> None:
    """Async realtime listener. Realtime requires the async client; run_once uses sync client in executor."""
    url = env_trim("SUPABASE_URL") or env_trim("NEXT_PUBLIC_SUPABASE_URL")
    key = env_trim("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return
    async_supabase = await acreate_client(url, key)
    executor = ThreadPoolExecutor(max_workers=1)
    last_run = 0.0
    debounce_sec = 2.0

    def _should_run_for_payload(payload: Any) -> bool:
        """Run processor only when an event can affect materialized output."""
        if not isinstance(payload, dict):
            return True
        new_row = payload.get("new") if isinstance(payload.get("new"), dict) else {}
        event_type = str(payload.get("eventType") or "").upper()
        # INSERT: only interesting if row is already approved.
        if event_type == "INSERT":
            return str(new_row.get("status") or "").lower() == "approved"
        # UPDATE: run when status is approved (e.g. triage approve) or gan_id got populated.
        if event_type == "UPDATE":
            status = str(new_row.get("status") or "").lower()
            if status == "approved":
                return True
            # If gan_id is now present, downstream processors may need to merge.
            return bool(new_row.get("gan_id"))
        # Fallback: run.
        return True

    def on_change(payload: Any) -> None:
        nonlocal last_run
        if not _should_run_for_payload(payload):
            return
        now = time.time()
        if now - last_run < debounce_sec:
            return
        last_run = now

        def do_run() -> None:
            try:
                counts = run_once(sync_supabase, dry_run)
                if any(counts.values()):
                    print(f"[{datetime.now(timezone.utc).isoformat()}] Processed{mode}: {format_counts(counts)}")
            except Exception as e:
                LOG.exception("Error during realtime run")
                print(f"[{datetime.now(timezone.utc).isoformat()}] Error: {e}")

        asyncio.get_running_loop().run_in_executor(executor, do_run)

    from realtime.types import RealtimePostgresChangesListenEvent

    channel = async_supabase.channel("user_inputs_processor")
    channel.on_postgres_changes(
        RealtimePostgresChangesListenEvent.Insert,
        on_change,
        table="user_inputs",
        schema="public",
    )
    channel.on_postgres_changes(
        RealtimePostgresChangesListenEvent.Update,
        on_change,
        table="user_inputs",
        schema="public",
    )
    await channel.subscribe()
    # Process any existing rows that were inserted before the listener started
    try:
        counts = run_once(sync_supabase, dry_run)
        if any(counts.values()):
            print(f"[{datetime.now(timezone.utc).isoformat()}] Initial pass{mode}: {format_counts(counts)}")
    except Exception as e:
        LOG.exception("Error during initial pass")
        print(f"[{datetime.now(timezone.utc).isoformat()}] Initial pass error: {e}")
    print(f"Listening for user_inputs INSERT/UPDATE events{mode}. Ctrl+C to stop.")
    try:
        while True:
            await asyncio.sleep(3600)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
