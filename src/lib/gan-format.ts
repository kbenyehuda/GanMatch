import type { Gan } from "@/types/ganim";

const NO_CITY = "—";
const NO_ADDRESS = "אין כתובת";

function firstIndexOfAny(haystack: string, needles: string[]) {
  const s = haystack;
  let best = -1;
  for (const n of needles) {
    const i = s.indexOf(n);
    if (i >= 0 && (best === -1 || i < best)) best = i;
  }
  return best;
}

function stripLeadingUiPrefixes(s: string) {
  let out = (s ?? "").trim();
  if (!out) return "";
  const prefixes = [
    "פתיחת מידע נוסף:",
    "סגירת מידע נוסף:",
    "פתיחת מידע נוסף :",
    "סגירת מידע נוסף :",
    "פתיחת מידע נוסף",
    "סגירת מידע נוסף",
    "פתיחת מידע:",
    "סגירת מידע:",
    "פתיחת מידע",
    "סגירת מידע",
    "מסגרת מידע נוסף:",
    "מסגרת מידע נוסף",
    "מידע נוסף:",
    "מידע נוסף",
    "לחצו לפרטים",
  ];
  // Strip repeatedly (some blobs repeat the label twice)
  for (let i = 0; i < 4; i++) {
    const hit = prefixes.find((p) => out.startsWith(p));
    if (!hit) break;
    out = out.slice(hit.length).trim();
    out = out.replace(/^[:\-–—|]+\s*/, "");
  }
  return out.trim();
}

function looksLikeStreetAddress(s: string) {
  const t = (s ?? "").trim();
  if (!t) return false;
  if (/\d/.test(t)) return true;
  // Sometimes street without number exists ("רחוב אלנבי")
  return /\b(רחוב|שדרות|שד׳|שד'|שד\.|דרך|סמטת|כיכר)\b/.test(t);
}

function normalizeAddressBlob(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  s = s.replace(/\s+/g, " ").replace(/[•｜│]/g, "|");
  s = s.replace(/\s*\|\s*/g, " | ").trim();
  s = stripLeadingUiPrefixes(s);

  // Cut off known non-address tokens that often appear in Tel Aviv municipal blobs.
  const cutAt = [
    "פתיחת מידע נוסף",
    "סגירת מידע נוסף",
    "מסגרת מידע נוסף",
    "מידע נוסף",
    "סמל מעון",
    "מוכר/פרטי",
    "תוקף רישיון",
    "סטטוס רישוי",
    "סטטוס",
    "רישיון",
    "טלפון",
    "מנהלת",
    "מנהל",
    "שעות",
    "אימייל",
    "דוא״ל",
    'דוא"ל',
  ];
  const cutIdx = firstIndexOfAny(s, cutAt);
  if (cutIdx > 0) s = s.slice(0, cutIdx).trim();

  s = s.replace(/[|;:\-–—]+$/g, "").trim();
  return s;
}

function splitCommaParts(s: string) {
  return s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function likelyNeighborhood(s: string) {
  // Neighborhoods are usually short, no digits, no obvious separators.
  if (!s) return false;
  if (s.length > 40) return false;
  if (/\d/.test(s)) return false;
  if (s.includes("|")) return false;
  return true;
}

export function getGanCityForDisplay(gan: Pick<Gan, "city">): string {
  const city = (gan.city ?? "").trim();
  return city || NO_CITY;
}

export function getGanNeighborhoodForDisplay(
  gan: Pick<Gan, "address" | "city" | "metadata">
): string | null {
  const metaNeighborhood =
    typeof (gan as any)?.metadata?.neighborhood === "string"
      ? String((gan as any).metadata.neighborhood).trim()
      : "";
  if (metaNeighborhood) return metaNeighborhood;

  const raw = normalizeAddressBlob(gan.address ?? "");
  if (!raw) return null;

  const parts = splitCommaParts(raw);
  if (parts.length < 2) return null;

  const city = (gan.city ?? "").trim();
  // If second part is city-ish, don't treat it as neighborhood.
  const second = parts[1];
  if (city && (second.includes(city) || city.includes(second))) return null;

  return likelyNeighborhood(second) ? second : null;
}

export function getGanStreetAddressForDisplay(gan: Pick<Gan, "address" | "city">): string {
  const raw = (gan.address ?? "").trim();
  if (!raw) return NO_ADDRESS;

  const s = normalizeAddressBlob(raw);
  if (!s) return NO_ADDRESS;

  // Prefer the first comma segment as "street + number".
  const parts = splitCommaParts(s);
  let street = parts[0] ?? s;

  // Remove city name if it's embedded.
  const city = (gan.city ?? "").trim();
  if (city) {
    street = street.replace(city, "").trim();
    street = street.replace(city.replace("-", " "), "").trim();
  }

  // If street accidentally becomes empty (address was just the city), fall back to original first part.
  if (!street) street = parts[0] ?? "";

  // Avoid showing non-address blobs (e.g. gan name / UI labels). If it doesn't look like a street, treat as missing.
  if (!looksLikeStreetAddress(street)) return NO_ADDRESS;
  return street;
}

/**
 * Some datasets stuff extra fields into "address" (e.g. license details, symbols, notes).
 * We keep the raw value in DB, but show a clean address in UI.
 */
export function formatGanAddressForDisplay(gan: Pick<Gan, "address" | "city">): string {
  const raw = (gan.address ?? "").trim();
  const city = (gan.city ?? "").trim();
  if (!raw) return city ? `${city} · ${NO_ADDRESS}` : NO_ADDRESS;

  let s = normalizeAddressBlob(raw);

  // If it's a multi-part sentence, keep the address-ish prefix (usually first 1-2 comma segments).
  // e.g. "אחדות העבודה 26, גבעתיים, סמל מעון: ..." -> keep "אחדות העבודה 26, גבעתיים"
  const parts = splitCommaParts(s);
  if (parts.length >= 3) s = `${parts[0]}, ${parts[1]}`;

  if (!s) return city ? `${city} · ${NO_ADDRESS}` : NO_ADDRESS;
  return s;
}

