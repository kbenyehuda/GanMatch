import type { Place } from "@/types/places";

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function pointInBounds(lon: number, lat: number, b: Bounds): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
}

export async function fetchPlacesInBounds(
  bounds: Bounds,
  categories?: string[]
): Promise<Place[]> {
  const params = new URLSearchParams({
    minLon: String(bounds.minLon),
    minLat: String(bounds.minLat),
    maxLon: String(bounds.maxLon),
    maxLat: String(bounds.maxLat),
  });
  if (categories && categories.length > 0) {
    params.set("categories", categories.join(","));
  }

  const res = await fetch(`/api/places?${params}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      typeof err?.error === "string"
        ? err.error
        : `Failed to load places (${res.status})`;
    console.error("[GiveMyTime] fetchPlacesInBounds error:", res.status, err);
    throw new Error(msg);
  }

  return (await res.json()) as Place[];
}

/** Every place in the city, including ones without a pin (lat/lon null). */
export async function fetchAllPlaces(): Promise<Place[]> {
  const res = await fetch(`/api/places?all=1`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg =
      typeof err?.error === "string"
        ? err.error
        : `Failed to load places (${res.status})`;
    console.error("[GiveMyTime] fetchAllPlaces error:", res.status, err);
    throw new Error(msg);
  }
  return (await res.json()) as Place[];
}

/** Distinct review tags per place id. Facts still work from fields if this fails, so it never throws. */
export async function fetchReviewTags(): Promise<Record<string, string[]>> {
  try {
    const res = await fetch(`/api/places/review-tags`);
    if (!res.ok) return {};
    const data = (await res.json()) as { tags?: Record<string, string[]> };
    return data.tags ?? {};
  } catch {
    return {};
  }
}

export async function searchPlaces(
  q: string,
  options?: { limit?: number; categories?: string[] }
): Promise<Partial<Place>[]> {
  if (q.trim().length < 2) return [];

  const params = new URLSearchParams({ q: q.trim() });
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.categories?.length) {
    params.set("categories", options.categories.join(","));
  }

  const res = await fetch(`/api/places/search?${params}`, { cache: "no-store" });
  if (!res.ok) {
    console.error("[GiveMyTime] searchPlaces error:", res.status);
    return [];
  }

  const data = (await res.json()) as { places: Partial<Place>[] };
  return data.places ?? [];
}
