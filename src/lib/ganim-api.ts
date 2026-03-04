import type { Gan } from "@/types/ganim";
import { publicEnv } from "@/lib/env/public";

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function fetchAllGanim(): Promise<Gan[]> {
  // Fetch directly from Supabase; the API route's supabase.rpc() caps at 50 rows.
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  const res = await fetch(`${url}/rest/v1/rpc/get_all_ganim`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      "Content-Type": "application/json",
      "Range-Unit": "items",
      Range: "0-999",
    },
    body: JSON.stringify({ p_limit: 1000 }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    console.error("[GanMatch] fetchAllGanim error:", res.status, err);
    const msg =
      typeof err?.error === "string"
        ? err.error
        : typeof err?.message === "string"
          ? err.message
          : err?.error && typeof (err.error as { message?: string }).message === "string"
            ? (err.error as { message: string }).message
            : `Failed to load ganim (${res.status})`;
    throw new Error(msg);
  }
  const data = (await res.json()) as unknown[];
  return (data ?? []).map((row: Record<string, unknown>) => ({
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
