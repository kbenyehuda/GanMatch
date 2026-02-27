import { supabase } from "./supabase";
import type { Gan } from "@/types/ganim";

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function fetchGanimInBounds(bounds: Bounds): Promise<Gan[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("get_ganim_in_bbox", {
    min_lon: bounds.minLon,
    min_lat: bounds.minLat,
    max_lon: bounds.maxLon,
    max_lat: bounds.maxLat,
    p_limit: 100,
  });

  if (error) {
    console.error("Error fetching ganim:", error);
    return [];
  }

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
