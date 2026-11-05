import type { Place, PlaceCategory } from "@/types/places";
import { HMO_LABELS, NEIGHBORHOOD_LABELS } from "@/types/places";
import type { PlaceFilters } from "@/types/place-filters";
import { applyPlaceFilters, hasNoPin, kidsTypeOf, mergedGanCategory, KIDS_GAN_TYPE } from "@/lib/apply-place-filters";
import { factById, factsFor, placeHasFact } from "@/lib/place-facts";
import { GAN_CATEGORY_LABELS } from "@/lib/place-type";

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
  /** Options combine with AND, so an option's count includes the ones already picked. */
  matchAll?: boolean;
  /** Hide the facet when every place in the category has the same value (nothing to choose). */
  needsChoice?: boolean;
}

/** Extra option on every choice filter: places whose value for that field isn't known yet. */
export const UNKNOWN_OPTION = "__unknown__";
const UNKNOWN_LABEL = "לא ידוע עדיין";
/** Toggles and "מה חשוב לכם" lists are about having a fact, so "unknown" means nothing there. */
const hasUnknownOption = (def: FacetDef) => def.mode !== "toggle" && !def.matchAll;

const attrs = (p: Place) => p.attributes as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arrayOrNull = <T,>(v: T[]) => (v.length ? v : null);
const toggleValue = (v: string[]) => (v.length ? true : null);

const KIDS_PRICE_BRACKETS = [1500, 2500, 4000, 6000, 8000];

/** "מה חשוב לכם": the category's facts (field or review tag); picked facts combine with AND. */
function factsFacet(
  key: string,
  category: PlaceCategory,
  get: FacetDef["get"],
  set: FacetDef["set"],
  exclude: string[] = [],
): FacetDef {
  const facts = factsFor(category).filter((f) => !exclude.includes(f.id));
  return {
    key, category, label: "מה חשוב לכם", mode: "multi", primary: true, matchAll: true,
    valuesOf: (p) => facts.filter((fact) => placeHasFact(p, fact)).map((fact) => fact.id),
    optionLabel: (id) => factById(id)?.label ?? id,
    get, set,
  };
}

const kidsTypeIs = (f: PlaceFilters, type: string) => f.kids_specialty?.includes(type) ?? false;

const FACET_DEFS: FacetDef[] = [
  // ── Kids ──────────────────────────────────────────────────────────────────
  {
    key: "kids_type", category: "kids", label: "סוג", mode: "single", primary: true,
    valuesOf: (p) => { const t = kidsTypeOf(p); return t ? [t] : []; },
    get: (f) => f.kids_specialty ?? [],
    // Changing type drops the sub-filters that belonged to the previous type.
    set: (f, v) => ({ ...f, kids_specialty: arrayOrNull(v), kids_gan_category: null, kids_age_track: null, kids_max_price_nis: null, kids_chugim: null, kids_workshops: null, kids_facts: null }),
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
    key: "kids_workshops", category: "kids", label: "תחום", mode: "multi", primary: true,
    visible: (f) => kidsTypeIs(f, "סדנאות"),
    valuesOf: (p) => {
      const w = attrs(p).workshop_types;
      return Array.isArray(w) ? w.map(str).filter(Boolean) : [];
    },
    get: (f) => f.kids_workshops ?? [],
    set: (f, v) => ({ ...f, kids_workshops: arrayOrNull(v) }),
  },
  {
    ...factsFacet("kids_facts", "kids", (f) => f.kids_facts ?? [], (f, v) => ({ ...f, kids_facts: arrayOrNull(v) })),
    visible: (f) => kidsTypeIs(f, KIDS_GAN_TYPE),
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
    valuesOf: (p) => (placeHasFact(p, factById("dr_for_children")!) ? ["yes"] : []),
    get: (f) => (f.doctor_for_children ? ["yes"] : []),
    set: (f, v) => ({ ...f, doctor_for_children: toggleValue(v) }),
  },
  // "לילדים" has its own pill, so it's left out of the doctor facts list.
  factsFacet("doctor_facts", "doctor", (f) => f.doctor_facts ?? [], (f, v) => ({ ...f, doctor_facts: arrayOrNull(v) }), ["dr_for_children"]),

  // ── Cosmetics ─────────────────────────────────────────────────────────────
  {
    key: "cosmetics_specialty", category: "cosmetics", label: "סוג", mode: "single", primary: true,
    valuesOf: (p) => { const s = str(attrs(p).specialty); return s ? [s] : []; },
    get: (f) => f.cosmetics_specialty ?? [],
    set: (f, v) => ({ ...f, cosmetics_specialty: arrayOrNull(v) }),
  },
  factsFacet("cosmetics_facts", "cosmetics", (f) => f.cosmetics_facts ?? [], (f, v) => ({ ...f, cosmetics_facts: arrayOrNull(v) })),

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

  // ── Every category: on the map or not (many places have an address but no pin yet) ──
  ...(["kids", "doctor", "cosmetics", "cafe", "sport", "attraction", "food", "clinic"] as PlaceCategory[]).map((category): FacetDef => ({
    key: `${category}_pin`, category, label: "מיקום", mode: "single", primary: true, needsChoice: true,
    valuesOf: (p) => [hasNoPin(p) ? "no_pin" : "on_map"],
    optionLabel: (id) => (id === "no_pin" ? "ללא מיקום על המפה" : "על המפה"),
    fixedOrder: ["on_map", "no_pin"],
    get: (f) => (f.pin_status ? [f.pin_status] : []),
    set: (f, v) => ({ ...f, pin_status: (v[0] as PlaceFilters["pin_status"]) ?? null }),
  })),
];

/** Facet key of the "מיקום" filter for a category. */
export const pinFacetKey = (category: PlaceCategory) => `${category}_pin`;

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
    const unknownPicked = hasUnknownOption(def) && (filters.unknown_facets ?? []).includes(def.key);
    if (placesWithField < MIN_PLACES_FOR_FILTER && selected.length === 0 && !unknownPicked) continue;
    if (def.needsChoice && freq.size < 2 && selected.length === 0) continue;

    for (const v of selected) if (!freq.has(v)) freq.set(v, 0);
    const ids = def.fixedOrder
      ? def.fixedOrder.filter((id) => freq.has(id))
      : Array.from(freq.keys()).sort((a, b) => (freq.get(b)! - freq.get(a)!) || a.localeCompare(b, "he"));

    // Each option's count is "this option alone" (or added to the picked ones for AND facets).
    const options = ids.map((id) => ({
      id,
      label: def.optionLabel?.(id) ?? id,
      count: applyFacetFilters(loaded, setFacetValues(filters, def.key, def.matchAll ? Array.from(new Set([...selected, id])) : [id])).length,
    }));

    if (hasUnknownOption(def)) {
      const count = applyFacetFilters(loaded, setFacetValues(filters, def.key, [UNKNOWN_OPTION])).length;
      if (count > 0 || unknownPicked) options.push({ id: UNKNOWN_OPTION, label: UNKNOWN_LABEL, count });
    }

    facets.push({
      key: def.key, label: def.label, mode: def.mode, primary: def.primary, options,
      selected: unknownPicked ? [...selected, UNKNOWN_OPTION] : selected,
    });
  }
  return facets;
}

export function setFacetValues(filters: PlaceFilters, key: string, values: string[]): PlaceFilters {
  const def = FACET_DEFS.find((d) => d.key === key);
  if (!def) return filters;
  const next = def.set(filters, values.filter((v) => v !== UNKNOWN_OPTION));
  const others = (filters.unknown_facets ?? []).filter((k) => k !== key);
  const unknown = values.includes(UNKNOWN_OPTION) && hasUnknownOption(def) ? [...others, key] : others;
  // A facet that is no longer shown (e.g. "סוג גן" after the type changed) drops its "unknown" pick too.
  const stillShown = unknown.filter((k) => {
    const d = FACET_DEFS.find((x) => x.key === k);
    return d && (!d.visible || d.visible(next));
  });
  return { ...next, unknown_facets: stillShown.length ? stillShown : null };
}

/** Clears every filter of a category, keeping the category itself and the search. */
export function clearCategoryFilters(filters: PlaceFilters, category: PlaceCategory): PlaceFilters {
  return FACET_DEFS.filter((d) => d.category === category).reduce((f, d) => setFacetValues(f, d.key, []), filters);
}

/**
 * applyPlaceFilters plus the "לא ידוע עדיין" picks: for such a facet a place passes when it has
 * no value for that field, or one of the values picked next to it.
 */
export function applyFacetFilters(places: Place[], filters: PlaceFilters, selectedPlaceId: string | null = null): Place[] {
  const defs = (filters.unknown_facets ?? [])
    .map((k) => FACET_DEFS.find((d) => d.key === k))
    .filter((d): d is FacetDef => !!d);
  if (!defs.length) return applyPlaceFilters(places, filters, selectedPlaceId);
  const picked = defs.map((d) => ({ d, values: d.get(filters) }));
  // Clearing via set() is safe: the only set() with side effects is kids_type, which is single-choice,
  // so when its "unknown" is picked it has no other value and its sub-filters are already cleared.
  const base = defs.reduce((f, d) => d.set(f, []), filters);
  return applyPlaceFilters(places, base, selectedPlaceId).filter((p) =>
    p.id === selectedPlaceId ||
    picked.every(({ d, values }) => {
      const has = d.valuesOf(p);
      return has.length === 0 || values.some((v) => has.includes(v));
    }),
  );
}

export function countSelected(facets: Facet[]): number {
  return facets.reduce((n, f) => n + f.selected.length, 0);
}
