import type { Place } from "@/types/places";

/**
 * The facts a parent needs most about a gan. The completeness bar on a place page and the
 * "רוצים להוסיף?" offer in the edit form both use this one list.
 * `bodyKeys` are the edit-form fields that fill the fact (age is two fields).
 */
export interface KeyFact {
  key: string;
  label: string;
  known: boolean;
  bodyKeys: string[];
}

export function getKeyFacts(place: Pick<Place, "attributes" | "hours">): KeyFact[] {
  const attrs = (place.attributes ?? {}) as Record<string, unknown>;
  return [
    { key: "monthly_price_nis", label: "מחיר", known: attrs.monthly_price_nis != null, bodyKeys: ["monthly_price_nis"] },
    { key: "vacancy_status", label: "מקום פנוי", known: attrs.vacancy_status != null && attrs.vacancy_status !== "UNKNOWN", bodyKeys: ["vacancy_status"] },
    { key: "min_age_months", label: "טווח גילאים", known: attrs.min_age_months != null, bodyKeys: ["min_age_months", "max_age_months"] },
    { key: "hours", label: "שעות פעילות", known: !!place.hours, bodyKeys: ["hours"] },
    { key: "meal_type", label: "סוג אוכל", known: attrs.meal_type != null && attrs.meal_type !== "UNKNOWN" && attrs.meal_type !== "", bodyKeys: ["meal_type"] },
    { key: "friday_schedule", label: "ימי שישי", known: attrs.friday_schedule != null && attrs.friday_schedule !== "UNKNOWN", bodyKeys: ["friday_schedule"] },
    { key: "has_outdoor_space", label: "חצר", known: attrs.has_outdoor_space != null, bodyKeys: ["has_outdoor_space"] },
    { key: "has_mamad", label: 'ממ"ד', known: attrs.has_mamad != null, bodyKeys: ["has_mamad"] },
  ];
}
