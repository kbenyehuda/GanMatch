import type { KosherStatus, NeighborhoodGivatayim, PlaceCategory } from "./places";

export interface PlaceFilters {
  categories: PlaceCategory[] | null;       // null = all categories
  neighborhoods: NeighborhoodGivatayim[] | null; // null = all neighborhoods
  kosher: KosherStatus[] | null;            // null = no filter
  price_range: (1 | 2 | 3)[] | null;       // null = all price ranges
  hmo: string[] | null;                     // 'maccabi'|'clalit'|'meuhedet'|'leumit'; null = all
  rated_only: boolean;
  min_rating: number | null;
  search_query: string | null;              // text search (name / address); future: LLM semantic
}

export const DEFAULT_PLACE_FILTERS: PlaceFilters = {
  categories: null,
  neighborhoods: null,
  kosher: null,
  price_range: null,
  hmo: null,
  rated_only: false,
  min_rating: null,
  search_query: null,
};

export function countActivePlaceFilters(f: PlaceFilters): number {
  let n = 0;
  if (f.categories != null && f.categories.length > 0) n++;
  if (f.neighborhoods != null && f.neighborhoods.length > 0) n++;
  if (f.kosher != null && f.kosher.length > 0) n++;
  if (f.price_range != null && f.price_range.length > 0) n++;
  if (f.hmo != null && f.hmo.length > 0) n++;
  if (f.rated_only) n++;
  if (f.min_rating != null) n++;
  if (f.search_query != null && f.search_query.trim() !== "") n++;
  return n;
}
