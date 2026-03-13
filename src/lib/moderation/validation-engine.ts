import "server-only";
import { loadModerationConfig } from "@/lib/moderation/moderation-config";
import type { GanEditPatch } from "@/lib/moderation/gan-edit-approval";

export type ValidationContext = {
  patch: GanEditPatch;
  existingGan?: {
    monthly_price_nis?: number | null;
    address?: string | null;
    city?: string | null;
    operating_hours?: string | null;
    friday_schedule?: string | null;
    staff_child_ratio?: number | null;
    vegetarian_friendly?: boolean | null;
    vegan_friendly?: boolean | null;
    allergy_friendly?: boolean | null;
    has_mamad?: boolean | null;
    first_aid_trained?: boolean | null;
    min_age_months?: number | null;
    max_age_months?: number | null;
    lat?: number | null;
    lon?: number | null;
    phone?: string[] | null;
    website_url?: string | null;
  } | null;
  approvedEditsCount: number;
  recentEditCountLastMinute: number;
  user: {
    email?: string | null;
    emailConfirmed: boolean;
    oauthProvider?: string | null;
  };
};

export type ValidationResult = {
  status: "approved" | "pending";
  reasonCodes: string[];
  skipInsert?: boolean;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

function normText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const sa = new Set(a.split(" "));
  const sb = new Set(b.split(" "));
  let inter = 0;
  for (const t of Array.from(sa)) if (sb.has(t)) inter += 1;
  const union = new Set([...Array.from(sa), ...Array.from(sb)]).size;
  return union === 0 ? 0 : inter / union;
}

function isValidIsraeliPhone(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (!digits) return false;
  // Israeli local/mobile forms: 0XXXXXXXXX, +972XXXXXXXXX, 972XXXXXXXXX
  if (digits.startsWith("0")) return digits.length === 9 || digits.length === 10;
  if (digits.startsWith("972")) return digits.length === 11 || digits.length === 12;
  return false;
}

function extractTextValues(value: unknown, out: string[]) {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractTextValues(item, out);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      extractTextValues(item, out);
    }
  }
}

function parseHours(raw: string | null | undefined): { open: number; close: number } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const open = Number(m[1]) * 60 + Number(m[2]);
  const close = Number(m[3]) * 60 + Number(m[4]);
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
  return { open, close };
}

function effectiveThreshold(base: number, isWorse: boolean, worseMul: number, betterMul: number): number {
  return base * (isWorse ? worseMul : betterMul);
}

function toFridayRank(v: unknown): number | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (!s || s === "UNKNOWN") return null;
  if (s === "NONE") return 0;
  if (s === "EVERY_OTHER_FRIDAY") return 1;
  if (s === "EVERY_FRIDAY") return 2;
  return null;
}

export class ValidationEngine {
  evaluate(ctx: ValidationContext): ValidationResult {
    const cfg = loadModerationConfig();
    const reasons: string[] = [];
    const flaggedReasons: string[] = [];

    // 1) Blacklist
    const texts: string[] = [];
    extractTextValues(ctx.patch, texts);
    const joined = texts.join(" \n ").toLowerCase();
    for (const term of cfg.blacklistTerms) {
      const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (esc && new RegExp(`\\b${esc}\\b`, "i").test(joined)) {
        flaggedReasons.push("BLACKLIST_MATCH");
        break;
      }
    }

    // 2) Diff thresholds: price and location (direction-aware).
    const oldPrice = ctx.existingGan?.monthly_price_nis;
    const nextPrice = typeof ctx.patch.monthly_price_nis === "number" ? ctx.patch.monthly_price_nis : null;
    if (oldPrice != null && oldPrice > 0 && nextPrice != null) {
      const deltaPct = Math.abs((nextPrice - oldPrice) / oldPrice) * 100;
      const isWorse = nextPrice > oldPrice; // price up is worse for parents
      const threshold = effectiveThreshold(
        cfg.priceChangePct,
        isWorse,
        cfg.worseDirectionMultiplier,
        cfg.betterDirectionMultiplier
      );
      if (deltaPct > threshold) flaggedReasons.push(isWorse ? "PRICE_UP_DELTA_HIGH" : "PRICE_DOWN_DELTA_HIGH");
    }
    const nextLat = typeof ctx.patch.lat === "number" ? ctx.patch.lat : null;
    const nextLon = typeof ctx.patch.lon === "number" ? ctx.patch.lon : null;
    const prevLat = ctx.existingGan?.lat ?? null;
    const prevLon = ctx.existingGan?.lon ?? null;
    if (nextLat != null && nextLon != null && prevLat != null && prevLon != null) {
      const km = haversineKm(prevLat, prevLon, nextLat, nextLon);
      if (km > cfg.locationChangeKm) flaggedReasons.push("LOCATION_DELTA_HIGH");
    } else if (typeof ctx.patch.address === "string" || typeof ctx.patch.city === "string") {
      reasons.push("LOCATION_TEXT_CHANGED");
    }

    // 3) Logic guards: operating hours + age range + phone format
    if (typeof ctx.patch.operating_hours === "string") {
      const s = ctx.patch.operating_hours.trim();
      const m = s.match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
      if (m) {
        const open = Number(m[1]) * 60 + Number(m[2]);
        const close = Number(m[3]) * 60 + Number(m[4]);
        if (Number.isFinite(open) && Number.isFinite(close) && open > close) {
          flaggedReasons.push("OPERATING_HOURS_INVALID");
        }
      }
    }
    if (cfg.enforceAgeLogic) {
      const minAge = typeof ctx.patch.min_age_months === "number" ? ctx.patch.min_age_months : ctx.existingGan?.min_age_months ?? null;
      const maxAge = typeof ctx.patch.max_age_months === "number" ? ctx.patch.max_age_months : ctx.existingGan?.max_age_months ?? null;
      if (minAge != null && maxAge != null && minAge > maxAge) flaggedReasons.push("AGE_RANGE_INVALID");
    }
    if (cfg.validatePhoneFormatRegion === "IL" && Array.isArray(ctx.patch.phone)) {
      const invalid = (ctx.patch.phone as unknown[]).some((p) => !isValidIsraeliPhone(String(p ?? "")));
      if (invalid) flaggedReasons.push("PHONE_FORMAT_INVALID");
    }

    // 3b) Direction-aware quantifiable checks (time, schedule, ratio, boolean quality flags).
    const oldHours = parseHours(ctx.existingGan?.operating_hours);
    const newHours =
      typeof ctx.patch.operating_hours === "string" ? parseHours(ctx.patch.operating_hours) : null;
    if (oldHours && newHours) {
      const closeDelta = newHours.close - oldHours.close;
      if (closeDelta !== 0) {
        const isWorse = closeDelta < 0; // earlier close is worse
        const threshold = effectiveThreshold(
          cfg.operatingHoursChangeMinutes,
          isWorse,
          cfg.worseDirectionMultiplier,
          cfg.betterDirectionMultiplier
        );
        if (Math.abs(closeDelta) > threshold) {
          reasons.push(isWorse ? "CLOSE_TIME_EARLIER_SIGNIFICANT" : "CLOSE_TIME_LATER_SIGNIFICANT");
        }
      }
    }

    const oldFriday = toFridayRank(ctx.existingGan?.friday_schedule);
    const newFriday = toFridayRank(ctx.patch.friday_schedule);
    if (oldFriday != null && newFriday != null && oldFriday !== newFriday) {
      if (newFriday < oldFriday) reasons.push("FRIDAY_SCHEDULE_DOWNGRADE");
      else reasons.push("FRIDAY_SCHEDULE_UPGRADE");
    }

    const boolDirectionalFields: Array<{
      key: keyof ValidationContext["patch"];
      old: boolean | null | undefined;
      goodWhenTrue: boolean;
      downgradeCode: string;
      upgradeCode: string;
    }> = [
      {
        key: "vegetarian_friendly",
        old: ctx.existingGan?.vegetarian_friendly,
        goodWhenTrue: true,
        downgradeCode: "VEGETARIAN_DOWNGRADE",
        upgradeCode: "VEGETARIAN_UPGRADE",
      },
      {
        key: "vegan_friendly",
        old: ctx.existingGan?.vegan_friendly,
        goodWhenTrue: true,
        downgradeCode: "VEGAN_DOWNGRADE",
        upgradeCode: "VEGAN_UPGRADE",
      },
      {
        key: "allergy_friendly",
        old: ctx.existingGan?.allergy_friendly,
        goodWhenTrue: true,
        downgradeCode: "ALLERGY_FRIENDLY_DOWNGRADE",
        upgradeCode: "ALLERGY_FRIENDLY_UPGRADE",
      },
      {
        key: "has_mamad",
        old: ctx.existingGan?.has_mamad,
        goodWhenTrue: true,
        downgradeCode: "MAMAD_DOWNGRADE",
        upgradeCode: "MAMAD_UPGRADE",
      },
      {
        key: "first_aid_trained",
        old: ctx.existingGan?.first_aid_trained,
        goodWhenTrue: true,
        downgradeCode: "FIRST_AID_DOWNGRADE",
        upgradeCode: "FIRST_AID_UPGRADE",
      },
    ];
    for (const f of boolDirectionalFields) {
      const nextRaw = ctx.patch[f.key];
      if (typeof nextRaw !== "boolean" || typeof f.old !== "boolean" || nextRaw === f.old) continue;
      const oldScore = f.old === f.goodWhenTrue ? 1 : 0;
      const newScore = nextRaw === f.goodWhenTrue ? 1 : 0;
      if (newScore < oldScore) reasons.push(f.downgradeCode);
      else reasons.push(f.upgradeCode);
    }

    const oldRatio = typeof ctx.existingGan?.staff_child_ratio === "number" ? ctx.existingGan.staff_child_ratio : null;
    const newRatio = typeof ctx.patch.staff_child_ratio === "number" ? ctx.patch.staff_child_ratio : null;
    if (oldRatio != null && oldRatio > 0 && newRatio != null) {
      const pct = Math.abs((newRatio - oldRatio) / oldRatio) * 100;
      const isWorse = newRatio < oldRatio; // lower staff ratio is worse
      const threshold = effectiveThreshold(
        cfg.staffRatioChangePct,
        isWorse,
        cfg.worseDirectionMultiplier,
        cfg.betterDirectionMultiplier
      );
      if (pct > threshold) reasons.push(isWorse ? "STAFF_RATIO_DOWNGRADE_HIGH" : "STAFF_RATIO_UPGRADE_HIGH");
    }

    // 4) Effort heuristic: minimum text length + velocity
    const textHeavyFields = ["price_notes", "suggested_type", "operating_hours"];
    for (const f of textHeavyFields) {
      const v = ctx.patch[f];
      if (typeof v === "string" && v.trim() && v.trim().length < cfg.minReviewLength) {
        reasons.push("LOW_EFFORT_TEXT");
        break;
      }
    }
    if (ctx.recentEditCountLastMinute > cfg.maxEditsPerMinute) {
      flaggedReasons.push("RATE_LIMIT_SUSPECTED");
    }

    // 5) Identity / trust
    if (cfg.requireEmailVerified && !ctx.user.emailConfirmed) {
      reasons.push("EMAIL_NOT_VERIFIED");
    }
    const provider = normText(ctx.user.oauthProvider ?? "");
    const trustedProvider = cfg.trustedOauthProviders.includes(provider);
    const trustedReputation = ctx.approvedEditsCount >= cfg.minApprovedEditsForAutoApprove;
    const trusted = trustedReputation || trustedProvider;

    // 6) Semantic noise / troll filters
    const textFields = ["address", "city", "website_url", "price_notes", "suggested_type", "operating_hours"];
    for (const f of textFields) {
      const next = ctx.patch[f];
      if (typeof next !== "string" || !next.trim()) continue;
      const prev = (ctx.existingGan as any)?.[f];
      if (typeof prev === "string" && prev.trim()) {
        const sim = similarity(normText(prev), normText(next));
        if (sim >= 0.95) {
          return { status: "approved", reasonCodes: ["NOOP_SIMILAR_TEXT"], skipInsert: true };
        }
      }
      if (f !== "website_url" && /(https?:\/\/|\.com\b|\.co\.il\b|www\.)/i.test(next)) {
        flaggedReasons.push("URL_SPAM_SUSPECTED");
      }
    }

    // Downgrade/negative-direction reasons should avoid auto-approve even for trusted users.
    const hardPendingPrefix = /_DOWNGRADE|_EARLIER_|PRICE_UP_|LOCATION_|BLACKLIST_|RATE_LIMIT_|INVALID|URL_SPAM/;
    const hardPending = [...flaggedReasons, ...reasons].some((r) => hardPendingPrefix.test(r));

    if (flaggedReasons.length > 0) {
      return { status: "pending", reasonCodes: Array.from(new Set([...flaggedReasons, ...reasons])) };
    }
    if (!trusted || reasons.length > 0 || hardPending) {
      return { status: "pending", reasonCodes: Array.from(new Set(reasons.length ? reasons : ["LOW_REPUTATION_PENDING"])) };
    }
    return { status: "approved", reasonCodes: ["AUTO_APPROVED_REPUTATION"] };
  }
}

