import type { Gan } from "@/types/ganim";
import { publicEnv } from "@/lib/env/public";
import { mapGanApiRow } from "@/lib/gan-row-map";

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function pointInBounds(lon: number, lat: number, b: Bounds): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
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
      Range: "0-99999",
    },
    body: JSON.stringify({ p_limit: 100000 }),
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
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((row) => mapGanApiRow(row));
}

export async function fetchGanimInBounds(bounds: Bounds): Promise<Gan[]> {
  const params = new URLSearchParams({
    minLon: String(bounds.minLon),
    minLat: String(bounds.minLat),
    maxLon: String(bounds.maxLon),
    maxLat: String(bounds.maxLat),
  });
  const res = await fetch(`/api/ganim?${params}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error("[GanMatch] API error:", res.status, err);
    const msg = typeof err?.error === "string" ? err.error : err?.error?.message ?? `Failed to load ganim (${res.status})`;
    throw new Error(msg);
  }
  const data = await res.json();
  return (data || []).map((row: Record<string, unknown>) => mapGanApiRow(row));
}
