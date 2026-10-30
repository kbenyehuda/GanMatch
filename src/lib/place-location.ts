import type { Place } from "@/types/places";

/**
 * A pin placed on the middle of a street (street known, house number not) is
 * marked `attributes.location_precision = "approximate"`. The map draws it as a
 * hollow pin and the card / place window say "מיקום משוער".
 */
export const APPROXIMATE_LOCATION_LABEL = "מיקום משוער";

export function isApproximateLocation(place: Place): boolean {
  return (place.attributes as Record<string, unknown> | null)?.location_precision === "approximate";
}
