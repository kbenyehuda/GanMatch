#!/usr/bin/env python3
"""
Process user_inputs and update ganim_v2 + confirmed_reviews.

Flow:
1. Read all user_inputs (or since last run)
2. For edits (input_type=edit, gan_id set): merge into ganim_v2 using "last inserted per field"
3. For suggest_gan (input_type=suggest_gan, gan_id null): create new ganim_v2 row
4. For reviews (input_type=review): insert into confirmed_reviews (verification logic here)

Current logic: last inserted per field. Can be extended (voting, moderation, etc.).

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
"""

from __future__ import annotations

import argparse
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env() -> None:
    load_dotenv(repo_root() / ".env.local")


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


def process_edits(supabase: Any, dry_run: bool) -> int:
    """Process edit inputs: merge into ganim_v2."""
    r = supabase.table("user_inputs").select("*").eq("input_type", "edit").not_.is_("gan_id", "null").execute()
    rows = r.data or []
    by_gan: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        gid = row.get("gan_id")
        if gid:
            by_gan[str(gid)].append(row)

    ganim_fields = [
        "address", "city", "website_url", "category", "maon_symbol_code",
        "private_supervision", "mishpachton_affiliation", "municipal_grade",
        "monthly_price_nis", "min_age_months", "max_age_months", "price_notes",
        "has_cctv", "cctv_streamed_online", "operating_hours", "friday_schedule",
        "meal_type", "vegan_friendly", "vegetarian_friendly", "meat_served",
        "allergy_friendly", "kosher_status", "kosher_certifier", "staff_child_ratio",
        "first_aid_trained", "languages_spoken", "has_outdoor_space", "has_mamad",
        "chugim_types", "vacancy_status",
    ]
    updated = 0
    for gan_id, inputs in by_gan.items():
        merged = last_per_field(inputs, ganim_fields)
        meta = merge_metadata(inputs)
        if not merged and not meta:
            continue
        payload: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
        payload.update(merged)
        if meta:
            if not dry_run:
                ex = supabase.table("ganim_v2").select("metadata").eq("id", gan_id).single().execute()
                base = (ex.data or {}).get("metadata") or {}
                if isinstance(base, dict):
                    meta = {**base, **meta}
            payload["metadata"] = meta
        if not dry_run:
            supabase.table("ganim_v2").update(payload).eq("id", gan_id).execute()
        updated += 1
    return updated


def process_suggest_gan(supabase: Any, dry_run: bool) -> int:
    """Process suggest_gan inputs: create new ganim_v2 rows with all user-provided fields."""
    r = supabase.table("user_inputs").select("*").eq("input_type", "suggest_gan").is_("gan_id", "null").execute()
    rows = r.data or []
    created = 0
    for row in rows:
        name_he = row.get("name_he")
        lat = row.get("lat")
        lon = row.get("lon")
        if not name_he or lat is None or lon is None:
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
                    "p_is_verified": False,
                    "p_metadata": meta,
                    "p_is_fallback": False,
                },
            ).execute()
            # Update with all extra columns from user_inputs
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
            supabase.table("ganim_v2").update(update_payload).eq("id", str(gan_id)).execute()
            supabase.table("user_inputs").update({"gan_id": str(gan_id)}).eq("id", row["id"]).execute()
        created += 1
    return created


def process_reviews(supabase: Any, dry_run: bool) -> int:
    """Process review inputs: insert into confirmed_reviews (current: approve all)."""
    r = supabase.table("user_inputs").select("*").eq("input_type", "review").not_.is_("gan_id", "null").execute()
    rows = r.data or []
    inserted = 0
    for row in rows:
        gan_id = row.get("gan_id")
        user_id = row.get("user_id")
        if not gan_id or not user_id:
            continue
        meta = row.get("metadata") or {}
        payload = {
            "user_id": user_id,
            "gan_id": gan_id,
            "rating": meta.get("rating") or 3,
            "cleanliness_rating": meta.get("cleanliness_rating"),
            "staff_rating": meta.get("staff_rating"),
            "safety_rating": meta.get("safety_rating"),
            "advice_to_parents_text": row.get("free_text_rec"),
            "enrollment_years": meta.get("enrollment_years"),
            "is_anonymous": row.get("anonymous", True),
            "allow_contact": row.get("allows_messages", True),
            "reviewer_public_name": meta.get("reviewer_public_name"),
            "reviewer_public_email_masked": meta.get("reviewer_public_email_masked"),
        }
        if not dry_run:
            supabase.table("confirmed_reviews").upsert(payload, on_conflict="user_id,gan_id").execute()
        inserted += 1
    return inserted


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Process user_inputs → ganim_v2, confirmed_reviews")
    parser.add_argument("--dry-run", action="store_true", help="No DB writes")
    args = parser.parse_args()

    url = require_env("SUPABASE_URL") or require_env("NEXT_PUBLIC_SUPABASE_URL")
    key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(url, key)

    edits = process_edits(supabase, args.dry_run)
    suggests = process_suggest_gan(supabase, args.dry_run)
    reviews = process_reviews(supabase, args.dry_run)

    mode = " [DRY RUN]" if args.dry_run else ""
    print(f"Processed{mode}: {edits} gan edits, {suggests} new ganim, {reviews} reviews")


if __name__ == "__main__":
    main()
