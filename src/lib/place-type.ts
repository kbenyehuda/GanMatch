import type { Place } from "@/types/places";
import { kidsTypeOf, mergedGanCategory, KIDS_GAN_TYPE } from "@/lib/apply-place-filters";

/** Gan types, with the three צהרון variants merged (see mergedGanCategory). */
export const GAN_CATEGORY_LABELS: Record<string, string> = {
  TZAHARON: "צהרון",
  PRIVATE_GAN: "גן פרטי",
  MUNICIPAL_GAN: "גן עירוני",
  MAON_SYMBOL: "מעון סמל",
  MISHPACHTON: "משפחתון",
};

/**
 * The most specific "what is it" for a place, for cards and the place header:
 * gan type (משפחתון) or kids type (חוגים: קפוארה), doctor specialty (+ לילדים),
 * cosmetics type. Null when unknown.
 */
export function placeTypeLabel(place: Place): string | null {
  const a = (place.attributes ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (place.place_category === "kids") {
    const type = kidsTypeOf(place);
    if (type === KIDS_GAN_TYPE) {
      const g = mergedGanCategory(a.gan_category);
      return (g && GAN_CATEGORY_LABELS[g]) || type;
    }
    const chugim = Array.isArray(a.chugim_types) ? (a.chugim_types as unknown[]).map(str).filter(Boolean) : [];
    if (type === "חוגים" && chugim.length) return `חוג ${chugim[0]}`;
    return type;
  }
  if (place.place_category === "doctor") {
    const s = str(a.specialty);
    const kids = a.for_children === true;
    if (s) return kids && !s.includes("ילדים") ? `${s} · לילדים` : s;
    return kids ? "לילדים" : null;
  }
  return str(a.specialty) || null;
}
