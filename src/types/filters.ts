import type {
  FridaySchedule,
  MealType,
  KosherStatus,
  SpokenLanguage,
  VacancyStatus,
} from "./ganim";

export interface GanFilters {
  friday_schedule: FridaySchedule[] | null; // gan matches ANY of selected
  meal_type: MealType[] | null; // gan matches ANY of selected
  vegan_friendly: boolean | null;
  vegetarian_friendly: boolean | null;
  meat_served: boolean | null;
  allergy_friendly: boolean | null;
  kosher_status: KosherStatus[] | null; // gan matches ANY of selected
  first_aid_trained: boolean | null;
  has_outdoor_space: boolean | null;
  has_mamad: boolean | null;
  vacancy_status: VacancyStatus[] | null; // gan matches ANY of selected
  languages_spoken: SpokenLanguage[] | null; // must have ALL of these
  max_price_nis: number | null;
  chugim: string[] | null; // gan must have at least one of these (exact match from data)
  operating_hours: string | null; // gan operating_hours must contain this (e.g. "7:30", "8:00")
  location_query: string | null; // text search (city/address/name) - AND with rest
}

export const DEFAULT_FILTERS: GanFilters = {
  friday_schedule: null,
  meal_type: null,
  vegan_friendly: null,
  vegetarian_friendly: null,
  meat_served: null,
  allergy_friendly: null,
  kosher_status: null,
  first_aid_trained: null,
  has_outdoor_space: null,
  has_mamad: null,
  vacancy_status: null,
  languages_spoken: null,
  max_price_nis: null,
  chugim: null,
  operating_hours: null,
  location_query: null,
};

export function hasActiveFilters(f: GanFilters): boolean {
  return countActiveFilters(f) > 0;
}

export function countActiveFilters(f: GanFilters): number {
  let n = 0;
  if (f.friday_schedule != null && f.friday_schedule.length > 0) n++;
  if (f.meal_type != null && f.meal_type.length > 0) n++;
  if (f.vegan_friendly != null) n++;
  if (f.vegetarian_friendly != null) n++;
  if (f.meat_served != null) n++;
  if (f.allergy_friendly != null) n++;
  if (f.kosher_status != null && f.kosher_status.length > 0) n++;
  if (f.first_aid_trained != null) n++;
  if (f.has_outdoor_space != null) n++;
  if (f.has_mamad != null) n++;
  if (f.vacancy_status != null && f.vacancy_status.length > 0) n++;
  if (f.languages_spoken != null && f.languages_spoken.length > 0) n++;
  if (f.max_price_nis != null) n++;
  if (f.chugim != null && f.chugim.length > 0) n++;
  if (f.operating_hours != null && f.operating_hours.trim() !== "") n++;
  if (f.location_query != null && f.location_query.trim() !== "") n++;
  return n;
}
