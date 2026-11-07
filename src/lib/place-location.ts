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

/**
 * A generous box around Giv'atayim. Outside it, a pin is almost surely in another city
 * (names and streets repeat across Israel). Used to ask an owner "are you sure?" and to
 * label such moves in the admin queue.
 */
const GIVATAYIM_BOX = { minLat: 32.058, maxLat: 32.085, minLon: 34.798, maxLon: 34.832 };

export function isInGivatayim(lat: number, lon: number): boolean {
  return lat >= GIVATAYIM_BOX.minLat && lat <= GIVATAYIM_BOX.maxLat && lon >= GIVATAYIM_BOX.minLon && lon <= GIVATAYIM_BOX.maxLon;
}
