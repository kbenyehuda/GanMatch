import type { Place, PlaceCategory, PlaceReview } from "@/types/places";

/**
 * One "facts" vocabulary per category: tags and structured fields are the same thing.
 * A fact is useful extra information that helps a parent choose (חצר, טבעוני, יחס אישי…).
 * It is never the type (גן, משפחתון), the category, the age group, the health fund or
 * generic praise (מומלץ, מקצועי) — those have their own spots or are noise.
 *
 * A place has a fact when its own fields say so, or when a review tag means it.
 * Gan list approved by the user 2026-10-30. Doctor (dr_*) and cosmetics (cos_*) lists were
 * drafted from the real review tags the same day while the user was away — pending review.
 */

export type GanApproach = "ANTHROPOSOPHIC" | "NATURE" | "MONTESSORI" | "BILINGUAL";

export const GAN_APPROACH_LABELS: Record<GanApproach, string> = {
  ANTHROPOSOPHIC: "אנתרופוסופי",
  NATURE: "גן טבע",
  MONTESSORI: "מונטסורי",
  BILINGUAL: "דו-לשוני",
};

export interface PlaceFact {
  id: string;
  category: PlaceCategory;
  group: string;
  label: string;
  /** True when the place's own fields say it has this fact. */
  fromFields: (p: Place) => boolean;
  /** Review tags that mean this fact, compared after normalizeTag. */
  synonyms: string[];
}

const attrs = (p: Place) => (p.attributes ?? {}) as Record<string, unknown>;
const isTrue = (key: string) => (p: Place) => attrs(p)[key] === true;
const hasApproach = (a: GanApproach) => (p: Place) => {
  const v = attrs(p).approach;
  return Array.isArray(v) && v.includes(a);
};

/** Latest closing time in an hours string ("07:30–16:45, א'-ה'" → 16.75), or null. */
export function closingHour(hours: string | null | undefined): number | null {
  if (!hours) return null;
  const times = Array.from(hours.matchAll(/(\d{1,2})[:.](\d{2})/g))
    .map((m) => Number(m[1]) + Number(m[2]) / 60)
    .filter((h) => h <= 24);
  return times.length ? Math.max(...times) : null;
}

/** Cosmetics services: [fact id, label = value stored in attributes.services, tag synonyms]. */
export const COSMETICS_SERVICES: [string, string, string[]][] = [
  ["gel", "לק ג'ל", ["לק גל", "לק גלי"]],
  ["manicure", "מניקור", ["מניקור", "ציפורניים"]],
  ["pedicure", "פדיקור", ["פדיקור"]],
  ["brows", "גבות", ["גבות", "סידור גבות"]],
  ["ear_piercing", "חורים באוזניים", ["חורים באוזניים", "חור באוזן", "עגילים"]],
  ["facial", "טיפול פנים", ["טיפול פנים", "טיפולי פנים"]],
  ["hair_color", "צבע שיער", ["צבע שיער", "צבע", "גוונים"]],
  ["curls", "תלתלים", ["תלתלים", "מספרת תלתלים", "מספר תלתלים"]],
  ["keratin", "החלקה / קראטין", ["טיפול קראטין", "קראטין", "החלקה"]],
  ["makeup", "איפור", ["איפור", "איפור שיער"]],
];

/** "שעות ארוכות" = closes at 16:30 or later (user, 2026-10-30). */
const LONG_HOURS_FROM = 16.5;

export const PLACE_FACTS: PlaceFact[] = [
  // ── Kids: facilities ──────────────────────────────────────────────────────
  { id: "outdoor", category: "kids", group: "מתקנים", label: "חצר",
    fromFields: isTrue("has_outdoor_space"),
    synonyms: ["חצר", "שטח חוץ", "חצר גדולה", "חצר מושקעת", "גינה"] },
  { id: "mamad", category: "kids", group: "מתקנים", label: 'ממ"ד',
    fromFields: isTrue("has_mamad"),
    synonyms: ["ממד", "מיקלט", "מקלט", "חדר מוגן"] },
  // One chip: the label upgrades when the cameras stream to parents (see factLabel).
  { id: "cctv", category: "kids", group: "מתקנים", label: "מצלמות",
    fromFields: isTrue("has_cctv"),
    synonyms: ["מצלמות", "מצלמות אבטחה", "שידור חי", "צפייה במצלמות", "מצלמות להורים"] },
  { id: "home_gan", category: "kids", group: "מתקנים", label: "גן ביתי",
    fromFields: isTrue("is_home_gan"),
    synonyms: ["גן ביתי", "אווירה ביתית", "בית פרטי", "גן קטן"] },

  // ── Kids: food ────────────────────────────────────────────────────────────
  { id: "cook", category: "kids", group: "אוכל", label: "בישול במקום",
    fromFields: (p) => attrs(p).meal_type === "IN_HOUSE_COOK",
    synonyms: ["בישול במקום", "אוכל ביתי", "אוכל מבושל", "מבשלת במקום", "טבחית"] },
  { id: "vegan", category: "kids", group: "אוכל", label: "טבעוני",
    fromFields: isTrue("vegan_friendly"),
    synonyms: ["טבעוני", "טבעונית", "מתאים לטבעונים"] },
  { id: "vegetarian", category: "kids", group: "אוכל", label: "צמחוני",
    fromFields: isTrue("vegetarian_friendly"),
    synonyms: ["צמחוני", "צמחונית", "בלי בשר"] },
  { id: "allergy", category: "kids", group: "אוכל", label: "מתאים לאלרגיות",
    fromFields: isTrue("allergy_friendly"),
    synonyms: ["אלרגיות", "מתאים לאלרגיות", "ללא אגוזים", "ללא גלוטן"] },

  // ── Kids: approach (attributes.approach, multi-value) ─────────────────────
  { id: "anthroposophic", category: "kids", group: "גישה", label: GAN_APPROACH_LABELS.ANTHROPOSOPHIC,
    fromFields: hasApproach("ANTHROPOSOPHIC"),
    synonyms: ["אנתרופוסופי", "אנתרופוסופית", "אנתרופוסופיה", "ולדורף"] },
  { id: "nature", category: "kids", group: "גישה", label: GAN_APPROACH_LABELS.NATURE,
    fromFields: hasApproach("NATURE"),
    synonyms: ["גן טבע", "גן יער", "טבע", "הרבה בחוץ", "גן חוץ"] },
  { id: "montessori", category: "kids", group: "גישה", label: GAN_APPROACH_LABELS.MONTESSORI,
    fromFields: hasApproach("MONTESSORI"),
    synonyms: ["מונטסורי"] },
  { id: "bilingual", category: "kids", group: "גישה", label: GAN_APPROACH_LABELS.BILINGUAL,
    fromFields: (p) => {
      const langs = attrs(p).languages_spoken;
      return hasApproach("BILINGUAL")(p) || (Array.isArray(langs) && langs.length >= 2);
    },
    synonyms: ["דו לשוני", "דו לשונית", "גן דו לשוני", "אנגלית"] },

  // ── Kids: staff and atmosphere ────────────────────────────────────────────
  { id: "small_group", category: "kids", group: "צוות ואווירה", label: "קבוצה קטנה / יחס אישי",
    fromFields: isTrue("small_group"),
    synonyms: ["יחס אישי", "קבוצה קטנה", "מעט ילדים", "תשומת לב אישית", "תשומת לב"] },
  { id: "stable_staff", category: "kids", group: "צוות ואווירה", label: "צוות יציב",
    fromFields: isTrue("stable_staff"),
    synonyms: ["צוות יציב", "גננת ותיקה", "צוות ותיק", "אין תחלופה", "אותו צוות"] },
  { id: "first_aid", category: "kids", group: "צוות ואווירה", label: "עזרה ראשונה",
    fromFields: isTrue("first_aid_trained"),
    synonyms: ["עזרה ראשונה", "החייאה", "קורס עזרה ראשונה"] },
  { id: "chugim_in_gan", category: "kids", group: "צוות ואווירה", label: "חוגים בגן",
    fromFields: isTrue("has_chugim_in_gan"),
    synonyms: ["חוגים בגן", "פעילויות העשרה", "העשרה"] },

  // ── Kids: hours and availability ──────────────────────────────────────────
  { id: "friday", category: "kids", group: "שעות וזמינות", label: "פתוח בשישי",
    fromFields: (p) => ["EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"].includes(String(attrs(p).friday_schedule ?? "")),
    synonyms: ["פתוח בשישי", "שישי לסירוגין", "פתוח בימי שישי"] },
  { id: "long_hours", category: "kids", group: "שעות וזמינות", label: "שעות ארוכות",
    fromFields: (p) => (closingHour(p.hours) ?? 0) >= LONG_HOURS_FROM,
    synonyms: ["שעות ארוכות", "יום ארוך", "עד 17", "עד 1630"] },
  { id: "flexible_hours", category: "kids", group: "שעות וזמינות", label: "גמישות בשעות",
    fromFields: isTrue("flexible_hours"),
    synonyms: ["גמישות", "גמישות בשעות", "גמישות באיסוף", "שעות גמישות"] },
  { id: "holiday_camp", category: "kids", group: "שעות וזמינות", label: "קייטנה בחופשים",
    fromFields: isTrue("has_holiday_camp"),
    synonyms: ["קייטנה", "קייטנת קיץ", "פתוח בחופשים", "פעיל בחגים"] },
  { id: "vacancy", category: "kids", group: "שעות וזמינות", label: "יש מקום פנוי",
    fromFields: (p) => ["Available", "Limited"].includes(String(attrs(p).vacancy_status ?? "")),
    synonyms: ["יש מקום", "מקום פנוי", "יש מקומות פנויים"] },

  // ── Doctors (drafted from the real review tags 2026-10-30, while the user was away) ──
  { id: "dr_for_children", category: "doctor", group: "למי", label: "מקבל ילדים",
    fromFields: isTrue("for_children"),
    synonyms: ["מתאים לילדים", "מקבל ילדים", "מקבלת ילדים", "קידס פרנדלי", "ילדים", "תינוקות", "מתאים לתינוקות"] },
  { id: "dr_pregnancy", category: "doctor", group: "למי", label: "מתאים להריון",
    fromFields: isTrue("pregnancy_friendly"),
    synonyms: ["מתאים להריון", "הריון", "מעקב הריון"] },
  { id: "dr_gentle", category: "doctor", group: "יחס", label: "קשוב וסבלני",
    fromFields: isTrue("gentle"),
    synonyms: ["קשוב", "קשובה", "סבלני", "סבלנית", "עדין", "עדינה", "רגיש", "רגישה"] },
  { id: "dr_short_wait", category: "doctor", group: "זמינות", label: "תור קצר",
    fromFields: isTrue("short_wait"),
    synonyms: ["תור קצר", "זמינות", "זמין", "זמינה", "תורים פנויים"] },
  { id: "dr_online", category: "doctor", group: "זמינות", label: "זמינות אונליין",
    fromFields: isTrue("online_available"),
    synonyms: ["זמינות אונליין", "זמין בוואטסאפ", "ייעוץ אונליין"] },
  { id: "dr_home_visits", category: "doctor", group: "זמינות", label: "ביקורי בית",
    fromFields: isTrue("home_visits"),
    synonyms: ["מגיע לבית", "מגיעה לבית", "ביקורי בית", "הגעה לבית"] },
  { id: "dr_private", category: "doctor", group: "זמינות", label: "פרטי",
    fromFields: isTrue("is_private"),
    synonyms: ["פרטי", "פרטית"] },

  // ── Cosmetics: services (attributes.services) and service style ──────────
  ...COSMETICS_SERVICES.map(([id, label, synonyms]): PlaceFact => ({
    id: `cos_${id}`, category: "cosmetics", group: "שירותים", label,
    fromFields: (p) => {
      const v = attrs(p).services;
      return Array.isArray(v) && v.includes(label);
    },
    synonyms,
  })),
  { id: "cos_home_visits", category: "cosmetics", group: "שירות", label: "הגעה לבית",
    fromFields: isTrue("home_visits"),
    synonyms: ["הגעה לבית", "מגיעה לבית", "מגיע לבית"] },
  { id: "cos_for_children", category: "cosmetics", group: "שירות", label: "מתאים לילדים",
    fromFields: isTrue("for_children"),
    synonyms: ["מתאים לילדים", "מתאים לילדות", "מספרת ילדים", "ילדים"] },
  { id: "cos_walk_in", category: "cosmetics", group: "שירות", label: "ללא תור",
    fromFields: isTrue("walk_in"),
    synonyms: ["ללא תור", "בלי תור", "אפשר בלי תור"] },
  { id: "cos_short_wait", category: "cosmetics", group: "שירות", label: "תורים פנויים",
    fromFields: isTrue("short_wait"),
    synonyms: ["תורים פנויים", "זמינות", "זמינה", "תור קצר"] },
];

/** Compares tags loosely: no quotes/geresh, hyphens and spaces collapsed ("ממ״ד" = "ממד"). */
export function normalizeTag(tag: string): string {
  return tag
    .replace(/["'״׳`:]/g, "")
    .replace(/[\s\-–־]+/g, " ")
    .trim()
    .toLowerCase();
}

const factBySynonym = new Map<string, PlaceFact>();
for (const fact of PLACE_FACTS) {
  for (const s of [fact.label, ...fact.synonyms]) {
    factBySynonym.set(`${fact.category}|${normalizeTag(s)}`, fact);
  }
}

export function factsFor(category: PlaceCategory): PlaceFact[] {
  return PLACE_FACTS.filter((f) => f.category === category);
}

export function factById(id: string): PlaceFact | undefined {
  return PLACE_FACTS.find((f) => f.id === id);
}

/** The fact a review tag means, or null (types, generic praise, negatives, locations). */
export function tagToFact(tag: string, category: PlaceCategory): PlaceFact | null {
  return factBySynonym.get(`${category}|${normalizeTag(tag)}`) ?? null;
}

export function factLabel(fact: PlaceFact, place: Place): string {
  if (fact.id === "cctv" && attrs(place).cctv_streamed_online === true) return "מצלמות עם צפייה להורים";
  return fact.label;
}

export function placeHasFact(place: Place, fact: PlaceFact): boolean {
  if (place.place_category !== fact.category) return false;
  if (fact.fromFields(place)) return true;
  return (place.review_tags ?? []).some((t) => tagToFact(t, place.place_category) === fact);
}

/** Every fact a place has: ones parents mention in reviews first, then field-only ones (vocabulary order within each). */
export function placeFacts(place: Place): PlaceFact[] {
  const mentioned = new Set((place.review_tags ?? []).map((t) => tagToFact(t, place.place_category)));
  const facts = factsFor(place.place_category).filter((f) => placeHasFact(place, f));
  return [...facts.filter((f) => mentioned.has(f)), ...facts.filter((f) => !mentioned.has(f))];
}

/** "מה ההורים אומרים": facts mentioned in reviews, most mentioned first. */
export function reviewFactCounts(reviews: PlaceReview[], category: PlaceCategory): { fact: PlaceFact; count: number }[] {
  const counts = new Map<PlaceFact, number>();
  for (const r of reviews) {
    const facts = new Set((r.tags ?? []).map((t) => tagToFact(t, category)).filter((f): f is PlaceFact => f != null));
    facts.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1));
  }
  const order = PLACE_FACTS;
  return Array.from(counts, ([fact, count]) => ({ fact, count }))
    .sort((a, b) => b.count - a.count || order.indexOf(a.fact) - order.indexOf(b.fact));
}
