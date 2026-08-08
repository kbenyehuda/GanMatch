import type { KosherStatus, NeighborhoodGivatayim, PlaceCategory } from "./places";

export interface PlaceFilters {
  categories: PlaceCategory[] | null;
  neighborhoods: NeighborhoodGivatayim[] | null;
  kosher: KosherStatus[] | null;
  price_range: (1 | 2 | 3)[] | null;
  hmo: string[] | null;
  rated_only: boolean;
  min_rating: number | null;
  search_query: string | null;
  // Kids-specific (place.attributes.*)
  kids_gan_category: string[] | null;
  kids_age_track: ("0-3" | "3+") | null;
  kids_max_price_nis: number | null;
  kids_meal_type: string[] | null;
  kids_friday: string[] | null;
  kids_outdoor: boolean | null;
  kids_vacancy: string[] | null;
  kids_languages: string[] | null;
  kids_has_mamad: boolean | null;
  kids_has_cctv: boolean | null;
  kids_first_aid: boolean | null;
  kids_vegan_friendly: boolean | null;
  kids_vegetarian_friendly: boolean | null;
  kids_meat_served: boolean | null;
  kids_allergy_friendly: boolean | null;
  kids_chugim: string[] | null;
  // Doctor-specific
  doctor_specialty: string[] | null;
  // Cosmetics-specific
  cosmetics_specialty: string[] | null;
  // General — any category with an hours field
  hours_contains: string | null;
  // Sport-specific
  sport_gender: string | null;
  // Attraction-specific
  attraction_venue: string[] | null;
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
  kids_gan_category: null,
  kids_age_track: null,
  kids_max_price_nis: null,
  kids_meal_type: null,
  kids_friday: null,
  kids_outdoor: null,
  kids_vacancy: null,
  kids_languages: null,
  kids_has_mamad: null,
  kids_has_cctv: null,
  kids_first_aid: null,
  kids_vegan_friendly: null,
  kids_vegetarian_friendly: null,
  kids_meat_served: null,
  kids_allergy_friendly: null,
  kids_chugim: null,
  doctor_specialty: null,
  cosmetics_specialty: null,
  hours_contains: null,
  sport_gender: null,
  attraction_venue: null,
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
  if (f.kids_gan_category != null && f.kids_gan_category.length > 0) n++;
  if (f.kids_age_track != null) n++;
  if (f.kids_max_price_nis != null) n++;
  if (f.kids_meal_type != null && f.kids_meal_type.length > 0) n++;
  if (f.kids_friday != null && f.kids_friday.length > 0) n++;
  if (f.kids_outdoor != null) n++;
  if (f.kids_vacancy != null && f.kids_vacancy.length > 0) n++;
  if (f.kids_languages != null && f.kids_languages.length > 0) n++;
  if (f.kids_has_mamad != null) n++;
  if (f.kids_has_cctv != null) n++;
  if (f.kids_first_aid != null) n++;
  if (f.kids_vegan_friendly != null) n++;
  if (f.kids_vegetarian_friendly != null) n++;
  if (f.kids_meat_served != null) n++;
  if (f.kids_allergy_friendly != null) n++;
  if (f.kids_chugim != null && f.kids_chugim.length > 0) n++;
  if (f.doctor_specialty != null && f.doctor_specialty.length > 0) n++;
  if (f.cosmetics_specialty != null && f.cosmetics_specialty.length > 0) n++;
  if (f.hours_contains != null && f.hours_contains.trim() !== "") n++;
  if (f.sport_gender != null) n++;
  if (f.attraction_venue != null && f.attraction_venue.length > 0) n++;
  return n;
}
