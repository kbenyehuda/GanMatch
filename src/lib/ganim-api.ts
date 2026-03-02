import type { Gan } from "@/types/ganim";

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function fetchAllGanim(): Promise<Gan[]> {
  const res = await fetch("/api/ganim?all=1");
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error("[GanMatch] API error:", res.status, err);
    const msg =
      typeof err?.error === "string"
        ? err.error
        : err?.error?.message ?? `Failed to load ganim (${res.status})`;
    throw new Error(msg);
  }
  const data = await res.json();
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name_he: row.name_he as string,
    name_en: (row.name_en as string) || null,
    address: (row.address as string) || null,
    city: (row.city as string) || null,
    type: row.type as Gan["type"],
    license_status: row.license_status as Gan["license_status"],
    has_cctv: (row.has_cctv as boolean) ?? false,
    cctv_streamed_online:
      row.cctv_streamed_online == null ? null : Boolean(row.cctv_streamed_online),
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
  }));
}

export async function fetchGanimInBounds(bounds: Bounds): Promise<Gan[]> {
  const params = new URLSearchParams({
    minLon: String(bounds.minLon),
    minLat: String(bounds.minLat),
    maxLon: String(bounds.maxLon),
    maxLat: String(bounds.maxLat),
  });
  const res = await fetch(`/api/ganim?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error("[GanMatch] API error:", res.status, err);
    const msg = typeof err?.error === "string" ? err.error : err?.error?.message ?? `Failed to load ganim (${res.status})`;
    throw new Error(msg);
  }
  const data = await res.json();
  return (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name_he: row.name_he as string,
    name_en: (row.name_en as string) || null,
    address: (row.address as string) || null,
    city: (row.city as string) || null,
    type: row.type as Gan["type"],
    license_status: row.license_status as Gan["license_status"],
    has_cctv: (row.has_cctv as boolean) ?? false,
    cctv_streamed_online:
      row.cctv_streamed_online == null ? null : Boolean(row.cctv_streamed_online),
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
  }));
}
