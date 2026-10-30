import type { KosherStatus, SpokenLanguage } from "@/types/places";

/**
 * "ערכו פרטים" for kids places: validation, diffing and applying of the editable fields.
 * Used when a user submits a request (/api/places/kids-attributes) and when an admin
 * approves it (/api/admin/place-detail-requests/decision).
 *
 * A change set maps a field to its new value (null = clear). Field keys are the
 * places.attributes keys, plus "hours" and "kosher", which are places columns.
 */
export type KidsChanges = Record<string, unknown>;

interface KidsPlaceValues {
  attributes: Record<string, unknown> | null;
  hours: string | null;
  kosher: string | null;
}

const MEAL_TYPES = ["IN_HOUSE_COOK", "EXTERNAL_CATERING", "PARENTS_BRING", "MIXED"];
const FRIDAY_SCHEDULES = ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"];
const VACANCY_STATUSES = ["Available", "Limited", "Full"];
const LANGUAGES: SpokenLanguage[] = ["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"];
const KOSHER_STATUSES: KosherStatus[] = ["CERTIFIED", "NOT_CERTIFIED", "UNKNOWN"];
const APPROACHES = ["ANTHROPOSOPHIC", "NATURE", "MONTESSORI", "BILINGUAL"];
const GAN_CATEGORIES = [
  "MAON_SYMBOL", "MISHPACHTON", "PRIVATE_GAN", "MUNICIPAL_GAN",
  "TZAHARON_MUNICIPAL", "TZAHARON_PRIVATE_SUPERVISED", "TZAHARON_PRIVATE_UNSUPERVISED",
];
const BOOLEAN_FIELDS = [
  "has_outdoor_space", "has_mamad", "has_cctv", "cctv_streamed_online", "first_aid_trained",
  "vegan_friendly", "vegetarian_friendly", "meat_served", "allergy_friendly",
  "is_home_gan", "small_group", "stable_staff", "has_chugim_in_gan", "has_holiday_camp", "flexible_hours",
];
const PLACE_COLUMNS = ["hours", "kosher"];

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
const num = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null;
const oneOf = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : null);
const list = (v: unknown, allowed?: string[]) => {
  const arr = Array.isArray(v)
    ? Array.from(new Set((v as unknown[]).map((x) => String(x ?? "").trim()).filter((x) => x && (!allowed || allowed.includes(x)))))
    : [];
  return arr.length ? arr : null;
};

/** Validated values for every field present in the body. Unknown keys are ignored. */
export function parseKidsChanges(body: Record<string, unknown>): KidsChanges {
  const out: KidsChanges = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (has("gan_category")) out.gan_category = oneOf(body.gan_category, GAN_CATEGORIES);
  if (has("maon_symbol_code")) out.maon_symbol_code = str(body.maon_symbol_code);
  if (has("min_age_months")) out.min_age_months = num(body.min_age_months, 0, 216);
  if (has("max_age_months")) out.max_age_months = num(body.max_age_months, 0, 216);
  if (has("meal_type")) out.meal_type = oneOf(body.meal_type, MEAL_TYPES);
  if (has("friday_schedule")) out.friday_schedule = oneOf(body.friday_schedule, FRIDAY_SCHEDULES);
  if (has("vacancy_status")) out.vacancy_status = oneOf(body.vacancy_status, VACANCY_STATUSES);
  if (has("monthly_price_nis")) out.monthly_price_nis = num(body.monthly_price_nis, 0, 30000);
  if (has("kosher_certifier")) out.kosher_certifier = str(body.kosher_certifier);
  if (has("staff_child_ratio")) out.staff_child_ratio = num(body.staff_child_ratio, 0, 1);
  for (const k of BOOLEAN_FIELDS) if (has(k)) out[k] = bool(body[k]);
  if (has("languages_spoken")) out.languages_spoken = list(body.languages_spoken, LANGUAGES);
  if (has("approach")) out.approach = list(body.approach, APPROACHES);
  if (has("chugim_types")) out.chugim_types = list(body.chugim_types);
  if (has("hours")) out.hours = str(body.hours);
  if (has("kosher")) out.kosher = oneOf(body.kosher, KOSHER_STATUSES);
  return out;
}

export function currentKidsValue(place: KidsPlaceValues, key: string): unknown {
  if (key === "hours") return place.hours ?? null;
  if (key === "kosher") return place.kosher === "UNKNOWN" ? null : place.kosher ?? null;
  return (place.attributes ?? {})[key] ?? null;
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v ?? null);
  return norm(a) === norm(b);
};

/** Only the fields whose value differs from the place, with their current values. */
export function diffKidsChanges(changes: KidsChanges, place: KidsPlaceValues): { changes: KidsChanges; previous: KidsChanges } {
  const changed: KidsChanges = {};
  const previous: KidsChanges = {};
  for (const [k, v] of Object.entries(changes)) {
    const cur = currentKidsValue(place, k);
    if (same(cur, v)) continue;
    changed[k] = v;
    previous[k] = cur;
  }
  return { changes: changed, previous };
}

/** The places update for a change set: merged attributes (nulls dropped) plus hours/kosher. */
export function applyKidsChanges(place: KidsPlaceValues, changes: KidsChanges): Record<string, unknown> {
  const attrs = { ...(place.attributes ?? {}) };
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (PLACE_COLUMNS.includes(k)) update[k] = v;
    else attrs[k] = v;
  }
  for (const k of Object.keys(attrs)) if (attrs[k] === null) delete attrs[k];
  return { ...update, attributes: attrs, updated_at: new Date().toISOString() };
}

// ── Hebrew labels for showing a change set (admin queue) ─────────────────────

export const KIDS_FIELD_LABELS: Record<string, string> = {
  gan_category: "סוג גן", maon_symbol_code: "סמל מעון", min_age_months: "גיל מינימום",
  max_age_months: "גיל מקסימום", meal_type: "סוג אוכל", friday_schedule: "ימי שישי",
  vacancy_status: "מקום פנוי", monthly_price_nis: "מחיר חודשי", kosher_certifier: "גוף כשרות",
  staff_child_ratio: "יחס צוות-ילד", has_outdoor_space: "חצר", has_mamad: 'ממ"ד',
  has_cctv: "מצלמות", cctv_streamed_online: "צפייה במצלמות", first_aid_trained: "עזרה ראשונה",
  vegan_friendly: "טבעוני", vegetarian_friendly: "צמחוני", meat_served: "מגיש בשר",
  allergy_friendly: "מתאים לאלרגיות", is_home_gan: "גן ביתי", small_group: "קבוצה קטנה / יחס אישי",
  stable_staff: "צוות יציב", has_chugim_in_gan: "חוגים בגן", has_holiday_camp: "קייטנה בחופשים",
  flexible_hours: "גמישות בשעות", languages_spoken: "שפות", approach: "גישה",
  chugim_types: "חוגים", hours: "שעות פעילות", kosher: "כשרות",
};

const VALUE_LABELS: Record<string, string> = {
  MAON_SYMBOL: "מעון סמל", MISHPACHTON: "משפחתון", PRIVATE_GAN: "גן פרטי", MUNICIPAL_GAN: "גן עירוני",
  TZAHARON_MUNICIPAL: "צהרון עירוני", TZAHARON_PRIVATE_SUPERVISED: "צהרון פרטי מפוקח",
  TZAHARON_PRIVATE_UNSUPERVISED: "צהרון פרטי ללא פיקוח",
  IN_HOUSE_COOK: "בישול במקום", EXTERNAL_CATERING: "קייטרינג", PARENTS_BRING: "הורים מביאים", MIXED: "מעורב",
  NONE: "ללא שישי", EVERY_FRIDAY: "כל שישי", EVERY_OTHER_FRIDAY: "כל שבועיים",
  Available: "יש מקום", Limited: "מקומות מוגבלים", Full: "מלא",
  CERTIFIED: "כשר", NOT_CERTIFIED: "לא כשר",
  HEBREW: "עברית", ENGLISH: "אנגלית", RUSSIAN: "רוסית", ARABIC: "ערבית",
  ANTHROPOSOPHIC: "אנתרופוסופי", NATURE: "גן טבע", MONTESSORI: "מונטסורי", BILINGUAL: "דו-לשוני",
};

export function formatKidsValue(key: string, value: unknown): string {
  if (value == null || (Array.isArray(value) && value.length === 0)) return "לא ידוע";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  if (Array.isArray(value)) return value.map((v) => VALUE_LABELS[String(v)] ?? String(v)).join(", ");
  if (key === "min_age_months" || key === "max_age_months") {
    const m = Number(value);
    return m < 24 ? `${m} חודשים` : `${Math.round((m / 12) * 2) / 2} שנים`;
  }
  if (key === "monthly_price_nis") return `${Number(value).toLocaleString("he-IL")} ₪`;
  return VALUE_LABELS[String(value)] ?? String(value);
}
