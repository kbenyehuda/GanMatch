import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serverEnv } from "@/lib/env/server";

type ModerationConfig = {
  blacklistTerms: string[];
  priceChangePct: number;
  locationChangeKm: number;
  minReviewLength: number;
  maxEditsPerMinute: number;
  operatingHoursChangeMinutes: number;
  staffRatioChangePct: number;
  minApprovedEditsForAutoApprove: number;
  trustedOauthProviders: string[];
  requireEmailVerified: boolean;
  validatePhoneFormatRegion: string | null;
  preventEmptyTextDiffs: boolean;
  enforceAgeLogic: boolean;
  worseDirectionMultiplier: number;
  betterDirectionMultiplier: number;
};

function toNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function toLowerStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function toBoolean(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

export function loadModerationConfig(): ModerationConfig {
  let raw: any = {};
  try {
    const p = join(process.cwd(), "config", "moderation.json");
    raw = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    raw = {};
  }

  const fileBlacklist = toLowerStringArray(raw?.blacklist_terms);
  const envBlacklist = Array.from(serverEnv.MODERATION_BLACKLIST_TERMS.values());

  return {
    blacklistTerms: fileBlacklist.length > 0 ? fileBlacklist : envBlacklist,
    priceChangePct: toNumber(
      raw?.thresholds?.price_change_pct,
      serverEnv.MODERATION_PRICE_CHANGE_THRESHOLD_PCT
    ),
    locationChangeKm: toNumber(
      raw?.thresholds?.location_change_km,
      serverEnv.MODERATION_LOCATION_CHANGE_KM
    ),
    minReviewLength: Math.max(0, Math.floor(toNumber(raw?.thresholds?.min_review_length, 40))),
    maxEditsPerMinute: Math.max(1, Math.floor(toNumber(raw?.thresholds?.max_edits_per_minute, 3))),
    operatingHoursChangeMinutes: Math.max(
      1,
      Math.floor(toNumber(raw?.thresholds?.operating_hours_change_minutes, 30))
    ),
    staffRatioChangePct: Math.max(1, toNumber(raw?.thresholds?.staff_ratio_change_pct, 20)),
    minApprovedEditsForAutoApprove: Math.max(
      0,
      Math.floor(
        toNumber(
          raw?.reputation?.min_approved_edits_for_auto_approve,
          serverEnv.MODERATION_MIN_APPROVED_EDITS_FOR_AUTO_APPROVE
        )
      )
    ),
    trustedOauthProviders: toLowerStringArray(raw?.reputation?.trusted_oauth_providers),
    requireEmailVerified: toBoolean(raw?.reputation?.require_email_verified, true),
    validatePhoneFormatRegion:
      typeof raw?.logic_guards?.validate_phone_format === "string" &&
      raw.logic_guards.validate_phone_format.trim()
        ? String(raw.logic_guards.validate_phone_format).trim().toUpperCase()
        : null,
    preventEmptyTextDiffs: toBoolean(raw?.logic_guards?.prevent_empty_text_diffs, true),
    enforceAgeLogic: toBoolean(raw?.logic_guards?.enforce_age_logic, true),
    worseDirectionMultiplier: Math.max(
      0.1,
      toNumber(raw?.directionality?.worse_multiplier, 0.7)
    ),
    betterDirectionMultiplier: Math.max(
      0.1,
      toNumber(raw?.directionality?.better_multiplier, 1.3)
    ),
  };
}

