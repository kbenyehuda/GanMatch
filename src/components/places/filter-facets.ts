import type { Place, PlaceCategory } from "@/types/places";
import { HMO_LABELS, NEIGHBORHOOD_LABELS } from "@/types/places";
import type { PlaceFilters } from "@/types/place-filters";
import { applyPlaceFilters, kidsTypeOf, mergedGanCategory, KIDS_GAN_TYPE } from "@/lib/apply-place-filters";

/**
 * Filter "facets": the pills shown under the category tabs. Each facet belongs to
 * one category, reads/writes one PlaceFilters field, and knows which values a place
 * has, so options and counts come from the data rather than a fixed list.
 *
 * A facet only shows once at least MIN_PLACES_FOR_FILTER places in its category have
 * that field — most attributes are known for 1–2 places, and a filter on those just
 * empties the list.
 */
export const MIN_PLACES_FOR_FILTER = 5;

export type FacetMode = "single" | "multi" | "toggle";

export interface FacetOption {
  id: string;
  label: string;
  /** Places in the current map area that match, given every other active filter. */
  count: number;
}

export interface Facet {
  key: string;
  label: string;
  mode: FacetMode;
  /** Primary facets are pills; the rest go behind the ⚙ button. */
  primary: boolean;
  options: FacetOption[];
  selected: string[];
}

interface FacetDef {
  key: string;
  category: PlaceCategory;
  label: string;
  mode: FacetMode;
  primary: boolean;
  valuesOf: (p: Place) => string[];
  optionLabel?: (id: string) => string;
  /** Fixed option order (e.g. price brackets); otherwise most common first. */
  fixedOrder?: string[];
  get: (f: PlaceFilters) => string[];
  set: (f: PlaceFilters, values: string[]) => PlaceFilters;
  /** Shown only in some contexts, e.g. gan type only once "גני ילדים" is picked. */
  visible?: (f: PlaceFilters) => boolean;
}

const attrs = (p: Place) => p.attributes as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arrayOrNull = <T,>(v: T[]) => (v.length ? v : null);
const toggleValue = (v: string[]) => (v.length ? true : null);

const GAN_CATEGORY_LABELS: Record<string, string> = {
  TZAHARON: "צהרון",
  PRIVATE_GAN: "גן פרטי",
  MUNICIPAL_GAN: "גן עירוני",
  MAON_SYMBOL: "מעון סמל",
  MISHPACHTON: "משפחתון",
};

const KIDS_PRICE_BRACKETS = [1500, 2500, 4000, 6000, 8000];

const kidsTypeIs = (f: PlaceFilters, type: string) => f.kids_specialty?.includes(type) ?? false;

const FACET_DEFS: FacetDef[] = [
  // ── Kids ──────────────────────────────────────────────────────────────────
  {
    key: "kids_type", category: "kids", label: "סוג", mode: "single", primary: true,
    valuesOf: (p) => { const t = kidsTypeOf(p); return t ? [t] : []; },
    get: (f) => f.kids_specialty ?? [],
    // Changing type drops the sub-filters that belonged to the previous type.
    set: (f, v) => ({ ...f, kids_specialty: arrayOrNull(v), kids_gan_category: null, kids_age_track: null, kids_max_price_nis: null, kids_chugim: null }),
  },
  {
    key: "kids_gan_category", category: "kids", label: "סוג גן", mode: "multi", primary: true,
    visible: (f) => kidsTypeIs(f, KIDS_GAN_TYPE),
    valuesOf: (p) => { const g = mergedGanCategory(attrs(p).gan_category); return g ? [g] : []; },
    optionLabel: (id) => GAN_CATEGORY_LABELS[id] ?? id,
    get: (f) => f.kids_gan_category ?? [],
    set: (f, v) => ({ ...f, kids_gan_category: arrayOrNull(v) }),
  },
  {
    key: "kids_age_track", category: "kids", label: "גיל", mode: "single", primary: true,
    visible: (f) => kidsTypeIs(f, KIDS_GAN_TYPE),
    valuesOf: (p) => {
      const a = attrs(p);
      if (a.min_age_months == null && a.max_age_months == null) return [];
      const min = Number(a.min_age_months ?? 0);
      const max = Number(a.max_age_months ?? 96);
      return [...(max <= 36 ? ["0-3"] : []), ...(min >= 36 ? ["3+"] : [])];
    },
    optionLabel: (id) => (id === "0-3" ? "עד גיל 3" : "מגיל 3"),
    fixedOrder: ["0-3", "3+"],
    get: (f) => (f.kids_age_track ? [f.kids_age_track] : []),
    set: (f, v) => ({ ...f, kids_age_track: (v[0] as "0-3" | "3+" | undefined) ?? null }),
  },
  {
    key: "kids_max_price_nis", category: "kids", label: "מחיר חודשי", mode: "single", primary: false,
    visible: (f) => kidsTypeIs(f, KIDS_GAN_TYPE),
    valuesOf: (p) => {
      const price = attrs(p).monthly_price_nis;
      if (price == null) return [];
      return KIDS_PRICE_BRACKETS.filter((b) => Number(price) <= b).map(String);
    },
    optionLabel: (id) => `עד ${Number(id).toLocaleString("he-IL")} ₪`,
    fixedOrder: KIDS_PRICE_BRACKETS.map(String),
    get: (f) => (f.kids_max_price_nis != null ? [String(f.kids_max_price_nis)] : []),
    set: (f, v) => ({ ...f, kids_max_price_nis: v[0] ? Number(v[0]) : null }),
  },
  {
    key: "kids_chugim", category: "kids", label: "תחום", mode: "multi", primary: true,
    visible: (f) => kidsTypeIs(f, "חוגים"),
    valuesOf: (p) => {
      const c = attrs(p).chugim_types;
      return Array.isArray(c) ? c.map(str).filter(Boolean) : [];
    },
    get: (f) => f.kids_chugim ?? [],
    set: (f, v) => ({ ...f, kids_chugim: arrayOrNull(v) }),
  },
  {
    key: "kids_neighborhood", category: "kids", label: "שכונה", mode: "multi", primary: true,
    valuesOf: (p) => (p.neighborhood ? [p.neighborhood] : []),
    optionLabel: (id) => NEIGHBORHOOD_LABELS[id as keyof typeof NEIGHBORHOOD_LABELS] ?? id,
    get: (f) => f.neighborhoods ?? [],
    set: (f, v) => ({ ...f, neighborhoods: arrayOrNull(v) as PlaceFilters["neighborhoods"] }),
  },

  // ── Doctors ───────────────────────────────────────────────────────────────
  {
    key: "doctor_specialty", category: "doctor", label: "התמחות", mode: "single", primary: true,
    valuesOf: (p) => { const s = str(attrs(p).specialty); return s ? [s] : []; },
    get: (f) => f.doctor_specialty ?? [],
    set: (f, v) => ({ ...f, doctor_specialty: arrayOrNull(v) }),
  },
  {
    key: "doctor_hmo", category: "doctor", label: "קופת חולים", mode: "single", primary: true,
    valuesOf: (p) => p.hmo ?? [],
    optionLabel: (id) => HMO_LABELS[id] ?? id,
    get: (f) => f.hmo ?? [],
    set: (f, v) => ({ ...f, hmo: arrayOrNull(v) }),
  },
  {
    key: "doctor_for_children", category: "doctor", label: "לילדים", mode: "toggle", primary: true,
    valuesOf: (p) => (attrs(p).for_children === true ? ["yes"] : []),
    get: (f) => (f.doctor_for_children ? ["yes"] : []),
    set: (f, v) => ({ ...f, doctor_for_children: toggleValue(v) }),
  },

  // ── Cosmetics ─────────────────────────────────────────────────────────────
  {
    key: "cosmetics_specialty", category: "cosmetics", label: "סוג", mode: "single", primary: true,
    valuesOf: (p) => { const s = str(attrs(p).specialty); return s ? [s] : []; },
    get: (f) => f.cosmetics_specialty ?? [],
    set: (f, v) => ({ ...f, cosmetics_specialty: arrayOrNull(v) }),
  },

  // ── Hidden categories (not in VISIBLE_CATEGORIES yet; kept so they work when re-enabled) ──
  {
    key: "sport_gender", category: "sport", label: "קהל יעד", mode: "single", primary: true,
    valuesOf: (p) => { const g = str(attrs(p).gender_restriction); return g ? [g] : []; },
    optionLabel: (id) => ({ women_only: "נשים בלבד", men_only: "גברים בלבד" } as Record<string, string>)[id] ?? id,
    get: (f) => (f.sport_gender ? [f.sport_gender] : []),
    set: (f, v) => ({ ...f, sport_gender: v[0] ?? null }),
  },
  {
    key: "attraction_venue", category: "attraction", label: "מיקום", mode: "multi", primary: true,
    valuesOf: (p) => { const v = str(attrs(p).indoor_outdoor); return v ? [v] : []; },
    optionLabel: (id) => ({ indoor: "פנים", outdoor: "חוץ", both: "פנים וחוץ" } as Record<string, string>)[id] ?? id,
    get: (f) => f.attraction_venue ?? [],
    set: (f, v) => ({ ...f, attraction_venue: arrayOrNull(v) }),
  },
  ...(["cafe", "food"] as PlaceCategory[]).flatMap((category): FacetDef[] => [
    {
      key: `${category}_price`, category, label: "מחיר", mode: "multi", primary: true,
      valuesOf: (p) => (p.price_range != null ? [String(p.price_range)] : []),
      optionLabel: (id) => "₪".repeat(Number(id)),
      fixedOrder: ["1", "2", "3"],
      get: (f) => (f.price_range ?? []).map(String),
      set: (f, v) => ({ ...f, price_range: arrayOrNull(v.map(Number) as (1 | 2 | 3)[]) }),
    },
    {
      key: `${category}_kosher`, category, label: "כשרות", mode: "multi", primary: true,
      valuesOf: (p) => (p.kosher && p.kosher !== "UNKNOWN" ? [p.kosher] : []),
      optionLabel: (id) => (id === "CERTIFIED" ? "כשר" : "לא כשר"),
      get: (f) => f.kosher ?? [],
      set: (f, v) => ({ ...f, kosher: arrayOrNull(v) as PlaceFilters["kosher"] }),
    },
  ]),
];

/**
 * Builds the facets for one category.
 * @param catalog city-wide places (stable option lists + the MIN_PLACES_FOR_FILTER cutoff)
 * @param loaded  places in the current map area, unfiltered (option counts)
 */
export function buildFacets(
  category: PlaceCategory,
  filters: PlaceFilters,
  catalog: Place[],
  loaded: Place[],
): Facet[] {
  const inCategory = catalog.filter((p) => p.place_category === category);
  const facets: Facet[] = [];

  for (const def of FACET_DEFS) {
    if (def.category !== category) continue;
    if (def.visible && !def.visible(filters)) continue;
    const selected = def.get(filters);

    const freq = new Map<string, number>();
    let placesWithField = 0;
    for (const p of inCategory) {
      const values = def.valuesOf(p);
      if (values.length) placesWithField++;
      for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
    }
    // Keep an active facet visible even if the data under it shrank, so it can be cleared.
    if (placesWithField < MIN_PLACES_FOR_FILTER && selected.length === 0) continue;

    for (const v of selected) if (!freq.has(v)) freq.set(v, 0);
    const ids = def.fixedOrder
      ? def.fixedOrder.filter((id) => freq.has(id))
      : Array.from(freq.keys()).sort((a, b) => (freq.get(b)! - freq.get(a)!) || a.localeCompare(b, "he"));

    const options = ids.map((id) => ({
      id,
      label: def.optionLabel?.(id) ?? id,
      count: applyPlaceFilters(loaded, def.set(filters, [id])).length,
    }));

    facets.push({ key: def.key, label: def.label, mode: def.mode, primary: def.primary, options, selected });
  }
  return facets;
}

export function setFacetValues(filters: PlaceFilters, key: string, values: string[]): PlaceFilters {
  const def = FACET_DEFS.find((d) => d.key === key);
  return def ? def.set(filters, values) : filters;
}

/** Clears every filter of a category, keeping the category itself and the search. */
export function clearCategoryFilters(filters: PlaceFilters, category: PlaceCategory): PlaceFilters {
  return FACET_DEFS.filter((d) => d.category === category).reduce((f, d) => d.set(f, []), filters);
}

export function countSelected(facets: Facet[]): number {
  return facets.reduce((n, f) => n + f.selected.length, 0);
}
