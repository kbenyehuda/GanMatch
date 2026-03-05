import type {
  FridaySchedule,
  MealType,
  KosherStatus,
  SpokenLanguage,
  VacancyStatus,
} from "./ganim";

export interface GanFilters {
  friday_schedule: FridaySchedule | null;
  meal_type: MealType | null;
  vegan_friendly: boolean | null;
  vegetarian_friendly: boolean | null;
  meat_served: boolean | null;
  allergy_friendly: boolean | null;
  kosher_status: KosherStatus | null;
  first_aid_trained: boolean | null;
  has_outdoor_space: boolean | null;
  has_mamad: boolean | null;
  vacancy_status: VacancyStatus | null;
  languages_spoken: SpokenLanguage[] | null; // must have ALL of these
  max_price_nis: number | null;
  chugim_has: string | null; // gan must have this chug type (substring match)
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
  chugim_has: null,
};

export function hasActiveFilters(f: GanFilters): boolean {
  return countActiveFilters(f) > 0;
}

export function countActiveFilters(f: GanFilters): number {
  let n = 0;
  if (f.friday_schedule != null) n++;
  if (f.meal_type != null) n++;
  if (f.vegan_friendly != null) n++;
  if (f.vegetarian_friendly != null) n++;
  if (f.meat_served != null) n++;
  if (f.allergy_friendly != null) n++;
  if (f.kosher_status != null) n++;
  if (f.first_aid_trained != null) n++;
  if (f.has_outdoor_space != null) n++;
  if (f.has_mamad != null) n++;
  if (f.vacancy_status != null) n++;
  if (f.languages_spoken != null && f.languages_spoken.length > 0) n++;
  if (f.max_price_nis != null) n++;
  if (f.chugim_has != null && f.chugim_has.trim() !== "") n++;
  return n;
}
