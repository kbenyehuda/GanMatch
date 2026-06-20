import type { Place } from "@/types/places";
import type { PlaceFilters } from "@/types/place-filters";

export function applyPlaceFilters(
  places: Place[],
  filters: PlaceFilters,
  selectedPlaceId: string | null = null
): Place[] {
  let result = places;
  if (filters.categories?.length)
    result = result.filter((p) => filters.categories!.includes(p.place_category));
  if (filters.neighborhoods?.length)
    result = result.filter((p) => p.neighborhood && filters.neighborhoods!.includes(p.neighborhood));
  if (filters.kosher?.length)
    result = result.filter((p) => p.kosher && filters.kosher!.includes(p.kosher));
  if (filters.price_range?.length)
    result = result.filter((p) => p.price_range != null && filters.price_range!.includes(p.price_range));
  if (filters.hmo?.length)
    result = result.filter((p) => p.hmo?.some((h) => filters.hmo!.includes(h)));
  if (filters.rated_only)
    result = result.filter((p) => p.avg_rating != null);
  if (filters.min_rating != null)
    result = result.filter((p) => p.avg_rating != null && p.avg_rating >= filters.min_rating!);
  if (filters.search_query?.trim()) {
    const q = filters.search_query.toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }
  // Kids-specific
  if (filters.kids_gan_category?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_gan_category!.includes(String(a.gan_category ?? ""));
    });
  if (filters.kids_age_track != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      // If age data is absent, include the place (can't filter on missing data)
      if (a.min_age_months == null && a.max_age_months == null) return true;
      const minAge = Number(a.min_age_months ?? 0);
      const maxAge = Number(a.max_age_months ?? 96);
      return filters.kids_age_track === "0-3" ? maxAge <= 36 : minAge >= 36;
    });
  if (filters.kids_max_price_nis != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      const price = a.monthly_price_nis;
      if (price == null) return true;
      return Number(price) <= filters.kids_max_price_nis!;
    });
  if (filters.kids_meal_type?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_meal_type!.includes(String(a.meal_type ?? ""));
    });
  if (filters.kids_friday?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_friday!.includes(String(a.friday_schedule ?? ""));
    });
  if (filters.kids_outdoor != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.has_outdoor_space) === filters.kids_outdoor;
    });
  if (filters.kids_vacancy?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_vacancy!.includes(String(a.vacancy_status ?? ""));
    });
  if (filters.kids_languages?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      const langs = Array.isArray(a.languages_spoken) ? a.languages_spoken as string[] : [];
      return filters.kids_languages!.every(l => langs.includes(l));
    });
  if (filters.kids_has_mamad != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.has_mamad) === filters.kids_has_mamad;
    });
  if (filters.kids_has_cctv != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.has_cctv) === filters.kids_has_cctv;
    });
  if (filters.kids_first_aid != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.first_aid_trained) === filters.kids_first_aid;
    });
  // Sport-specific
  if (filters.sport_gender)
    result = result.filter((p) => {
      if (p.place_category !== "sport") return true;
      const a = p.attributes as Record<string, unknown>;
      return a.gender_restriction === filters.sport_gender;
    });
  // Attraction-specific
  if (filters.attraction_venue?.length)
    result = result.filter((p) => {
      if (p.place_category !== "attraction") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.attraction_venue!.includes(String(a.indoor_outdoor ?? ""));
    });
  if (selectedPlaceId && !result.find((p) => p.id === selectedPlaceId)) {
    const sel = places.find((p) => p.id === selectedPlaceId);
    if (sel) result = [...result, sel];
  }
  return result;
}
