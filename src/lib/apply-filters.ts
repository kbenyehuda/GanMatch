import type { Gan } from "@/types/ganim";
import type { GanFilters } from "@/types/filters";
import { pointInBounds, type Bounds } from "@/lib/ganim-api";

function skipLocationFilter(query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (/\d/.test(q)) return true;
  if (/\b(רחוב|שדרות|שד׳|דרך|כיכר|סמטת)\b/.test(q)) return true;
  if (q.length > 25) return true;
  return false;
}

export interface ApplyFiltersOptions {
  bounds?: Bounds | null;
  selectedGanId?: string | null;
}

export function applyFilters(
  ganim: Gan[],
  filters: GanFilters,
  options?: ApplyFiltersOptions
): Gan[] {
  const { bounds, selectedGanId } = options ?? {};

  return ganim.filter((g) => {
    if (bounds) {
      if (!pointInBounds(g.lon, g.lat, bounds) && g.id !== selectedGanId) return false;
    }
    if (filters.location_query && filters.location_query.trim() && !skipLocationFilter(filters.location_query)) {
      const q = filters.location_query.toLowerCase();
      const match =
        g.name_he.toLowerCase().includes(q) ||
        (g.name_en?.toLowerCase().includes(q)) ||
        (g.city?.toLowerCase().includes(q)) ||
        (g.address?.toLowerCase().includes(q));
      if (!match) return false;
    }
    if (filters.friday_schedule != null && filters.friday_schedule.length > 0) {
      if (!g.friday_schedule || !filters.friday_schedule.includes(g.friday_schedule)) return false;
    }
    if (filters.meal_type != null && filters.meal_type.length > 0) {
      if (!g.meal_type || !filters.meal_type.includes(g.meal_type)) return false;
    }
    if (filters.vegan_friendly != null && g.vegan_friendly !== filters.vegan_friendly) return false;
    if (filters.vegetarian_friendly != null && g.vegetarian_friendly !== filters.vegetarian_friendly) return false;
    if (filters.meat_served != null && g.meat_served !== filters.meat_served) return false;
    if (filters.allergy_friendly != null && g.allergy_friendly !== filters.allergy_friendly) return false;
    if (filters.kosher_status != null && filters.kosher_status.length > 0) {
      if (!g.kosher_status || !filters.kosher_status.includes(g.kosher_status)) return false;
    }
    if (filters.first_aid_trained != null && g.first_aid_trained !== filters.first_aid_trained) return false;
    if (filters.has_outdoor_space != null && g.has_outdoor_space !== filters.has_outdoor_space) return false;
    if (filters.has_mamad != null && g.has_mamad !== filters.has_mamad) return false;
    if (filters.vacancy_status != null && filters.vacancy_status.length > 0) {
      if (!g.vacancy_status || !filters.vacancy_status.includes(g.vacancy_status)) return false;
    }
    if (filters.languages_spoken != null && filters.languages_spoken.length > 0) {
      const langs = g.languages_spoken ?? [];
      const hasAll = filters.languages_spoken.every((l) => langs.includes(l));
      if (!hasAll) return false;
    }
    if (filters.max_price_nis != null) {
      const p = g.monthly_price_nis ?? 0;
      if (p > filters.max_price_nis) return false;
    }
    if (filters.chugim_has != null && filters.chugim_has.trim() !== "") {
      const chugim = g.chugim_types ?? [];
      const q = filters.chugim_has.trim().toLowerCase();
      const hasMatch = chugim.some((c) => c.toLowerCase().includes(q));
      if (!hasMatch) return false;
    }
    if (filters.operating_hours != null && filters.operating_hours.trim() !== "") {
      const hours = (g.operating_hours ?? "").trim();
      const q = filters.operating_hours.trim();
      if (!hours || !hours.includes(q)) return false;
    }
    return true;
  });
}
