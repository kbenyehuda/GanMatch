/**
 * The basic details an approved owner can edit on any place (user decision 2026-11-07:
 * owners edit every detail). Client-safe. Kids fields stay in kids-attributes.ts.
 *
 * Keys are places columns, except "specialty", which lives in places.attributes.
 */
export type BasicChanges = Record<string, unknown>;

interface BasicPlaceValues {
  name: string | null;
  address: string | null;
  phone: string[] | null;
  website: string | null;
  hours: string | null;
  description: string | null;
  hmo: string[] | null;
  attributes: Record<string, unknown> | null;
}

export const BASIC_SELECT = "name, address, phone, website, hours, description, hmo, attributes";

const HMOS = ["maccabi", "clalit", "meuhedet", "leumit"];
const COLUMNS = ["name", "address", "phone", "website", "hours", "description", "hmo"];

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const list = (v: unknown, allowed?: string[]) => {
  const arr = Array.isArray(v)
    ? Array.from(new Set((v as unknown[]).map((x) => String(x ?? "").trim()).filter((x) => x && (!allowed || allowed.includes(x)))))
    : [];
  return arr.length ? arr : null;
};

/** Validated values for every basic field present in the body. Name can't be emptied. */
export function parseBasicChanges(body: Record<string, unknown>): BasicChanges {
  const out: BasicChanges = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  if (has("name") && str(body.name, 120)) out.name = str(body.name, 120);
  if (has("address")) out.address = str(body.address, 200);
  if (has("phone")) out.phone = list(body.phone)?.map((p) => p.replace(/[^\d+\-\s]/g, "").trim()).filter(Boolean) ?? null;
  if (has("website")) {
    const w = str(body.website, 300);
    out.website = w && !/^https?:\/\//i.test(w) ? `https://${w}` : w;
  }
  if (has("hours")) out.hours = str(body.hours, 300);
  if (has("description")) out.description = str(body.description, 2000);
  if (has("hmo")) out.hmo = list(body.hmo, HMOS);
  if (has("specialty")) out.specialty = str(body.specialty, 120);
  return out;
}

export function currentBasicValue(place: BasicPlaceValues, key: string): unknown {
  if (key === "specialty") return (place.attributes ?? {}).specialty ?? null;
  const v = (place as unknown as Record<string, unknown>)[key];
  if (Array.isArray(v) && v.length === 0) return null;
  return v ?? null;
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v ?? null);
  return norm(a) === norm(b);
};

export function diffBasicChanges(changes: BasicChanges, place: BasicPlaceValues): { changes: BasicChanges; previous: BasicChanges } {
  const changed: BasicChanges = {};
  const previous: BasicChanges = {};
  for (const [k, v] of Object.entries(changes)) {
    const cur = currentBasicValue(place, k);
    if (same(cur, v)) continue;
    changed[k] = v;
    previous[k] = cur;
  }
  return { changes: changed, previous };
}

export const isBasicKey = (k: string) => k === "specialty" || COLUMNS.includes(k);

/** The places update for a basic change set. */
export function applyBasicChanges(place: { attributes: Record<string, unknown> | null }, changes: BasicChanges): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  let attrs: Record<string, unknown> | null = null;
  for (const [k, v] of Object.entries(changes)) {
    if (k === "specialty") {
      attrs = attrs ?? { ...(place.attributes ?? {}) };
      if (v == null) delete attrs.specialty; else attrs.specialty = v;
    } else if (k === "phone" || k === "hmo") {
      update[k] = v ?? [];
    } else if (k === "name") {
      if (v) update.name = v; // never empty
    } else {
      update[k] = v;
    }
  }
  if (attrs) update.attributes = attrs;
  return { ...update, updated_at: new Date().toISOString() };
}

export const BASIC_FIELD_LABELS: Record<string, string> = {
  name: "שם", address: "כתובת", phone: "טלפון", website: "אתר", hours: "שעות פעילות",
  description: "תיאור", hmo: "קופות חולים", specialty: "תחום",
  remove_listing: "בקשה להסרת הרישום", removal_reason: "סיבה", removal_details: "פירוט",
};

const HMO_LABELS: Record<string, string> = { maccabi: "מכבי", clalit: "כללית", meuhedet: "מאוחדת", leumit: "לאומית" };

export function formatBasicValue(key: string, value: unknown): string {
  if (value == null || (Array.isArray(value) && value.length === 0)) return "—";
  if (key === "remove_listing") return value ? "כן, להסיר" : "—";
  if (key === "removal_reason") return REMOVAL_REASONS[String(value)] ?? String(value);
  if (key === "hmo" && Array.isArray(value)) return value.map((v) => HMO_LABELS[String(v)] ?? String(v)).join(", ");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Why an owner asks to remove a listing (required; "other" needs details). Decision 2026-11-07. */
export const REMOVAL_REASONS: Record<string, string> = {
  closed: "המקום נסגר",
  moved: "עבר לכתובת אחרת",
  not_accepting: "לא מקבלים לקוחות חדשים",
  private_home: "זה הבית שלי, פרטיות",
  other: "אחר",
};
