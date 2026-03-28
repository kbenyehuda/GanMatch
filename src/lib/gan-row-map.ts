import type { Gan } from "@/types/ganim";

export function mapGanApiRow(row: Record<string, unknown>): Gan {
  return {
    id: row.id as string,
    name_he: row.name_he as string,
    name_en: (row.name_en as string) || null,
    address: (row.address as string) || null,
    city: (row.city as string) || null,
    website_url: (row.website_url as string) || null,
    category: row.category as Gan["category"],
    maon_symbol_code: (row.maon_symbol_code as string) || null,
    private_supervision: (row.private_supervision as Gan["private_supervision"]) ?? null,
    mishpachton_affiliation: (row.mishpachton_affiliation as Gan["mishpachton_affiliation"]) ?? null,
    municipal_grade: (row.municipal_grade as Gan["municipal_grade"]) ?? null,
    monthly_price_nis: row.monthly_price_nis == null ? null : Number(row.monthly_price_nis),
    min_age_months: row.min_age_months == null ? null : Number(row.min_age_months),
    max_age_months: row.max_age_months == null ? null : Number(row.max_age_months),
    price_notes: (row.price_notes as string) || null,
    has_cctv: (row.has_cctv as boolean) ?? false,
    cctv_streamed_online:
      row.cctv_streamed_online == null ? null : Boolean(row.cctv_streamed_online),
    operating_hours: (row.operating_hours as string) || null,
    friday_schedule: (row.friday_schedule as Gan["friday_schedule"]) ?? null,
    meal_type: (row.meal_type as Gan["meal_type"]) ?? null,
    vegan_friendly: row.vegan_friendly == null ? null : Boolean(row.vegan_friendly),
    vegetarian_friendly: row.vegetarian_friendly == null ? null : Boolean(row.vegetarian_friendly),
    meat_served: row.meat_served == null ? null : Boolean(row.meat_served),
    allergy_friendly: row.allergy_friendly == null ? null : Boolean(row.allergy_friendly),
    kosher_status: (row.kosher_status as Gan["kosher_status"]) ?? null,
    kosher_certifier: (row.kosher_certifier as string) || null,
    staff_child_ratio: row.staff_child_ratio == null ? null : Number(row.staff_child_ratio),
    first_aid_trained: row.first_aid_trained == null ? null : Boolean(row.first_aid_trained),
    languages_spoken: (row.languages_spoken as Gan["languages_spoken"]) ?? null,
    has_outdoor_space: row.has_outdoor_space == null ? null : Boolean(row.has_outdoor_space),
    has_mamad: row.has_mamad == null ? null : Boolean(row.has_mamad),
    chugim_types: (row.chugim_types as string[]) ?? null,
    vacancy_status: (row.vacancy_status as Gan["vacancy_status"]) ?? null,
    metadata: (row.metadata as Gan["metadata"]) || {},
    is_verified: (row.is_verified as boolean) ?? true,
    avg_rating:
      typeof row.avg_rating === "number"
        ? (row.avg_rating as number)
        : row.avg_rating == null
          ? null
          : Number(row.avg_rating),
    avg_cleanliness:
      row.avg_cleanliness == null ? null : Number(row.avg_cleanliness),
    avg_staff: row.avg_staff == null ? null : Number(row.avg_staff),
    avg_communication:
      row.avg_communication == null ? null : Number(row.avg_communication),
    avg_food: row.avg_food == null ? null : Number(row.avg_food),
    avg_location: row.avg_location == null ? null : Number(row.avg_location),
    recommendation_count:
      typeof row.recommendation_count === "number"
        ? (row.recommendation_count as number)
        : Number(row.recommendation_count ?? 0),
    lat: row.lat as number,
    lon: row.lon as number,
  };
}
