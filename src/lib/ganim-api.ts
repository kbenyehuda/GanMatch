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
    metadata: (row.metadata as Gan["metadata"]) || {},
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
    metadata: (row.metadata as Gan["metadata"]) || {},
    lat: row.lat as number,
    lon: row.lon as number,
  }));
}
