import "server-only";

import { cache } from "react";
import { serverEnv } from "@/lib/env/server";
import type { Place } from "@/types/places";

function parseEwkbPointHex(hex: string): { lat: number; lon: number } | null {
  const clean = hex.replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]+$/i.test(clean) || clean.length < 40) return null;
  const buf = Buffer.from(clean, "hex");
  if (buf.length < 21) return null;
  if (buf.readUInt8(0) !== 1) return null; // must be little-endian
  let o = 1;
  const readU32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const readF64 = () => { const v = buf.readDoubleLE(o); o += 8; return v; };
  const wkbType = readU32();
  if ((wkbType & 0x20000000) !== 0) readU32(); // skip SRID
  if ((wkbType & 0xff) !== 1) return null; // must be Point
  const x = readF64();
  const y = readF64();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { lon: x, lat: y };
}

function parseCoords(row: Record<string, unknown>): { lat: number; lon: number } | null {
  const loc = row.location;

  // GeoJSON object
  if (loc && typeof loc === "object" && "coordinates" in (loc as object)) {
    const c = (loc as { coordinates?: unknown }).coordinates;
    if (Array.isArray(c) && c.length >= 2) {
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  // EWKB hex string
  if (typeof loc === "string") {
    const trimmed = loc.trim().replace(/^SRID=\d+;\s*/i, "");
    // Embedded GeoJSON
    if (trimmed.startsWith("{")) {
      try {
        const j = JSON.parse(trimmed) as { type?: string; coordinates?: unknown };
        if (j.type === "Point" && Array.isArray(j.coordinates) && j.coordinates.length >= 2) {
          const lon = Number(j.coordinates[0]);
          const lat = Number(j.coordinates[1]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        }
      } catch { /* ignore */ }
    }
    const fromHex = parseEwkbPointHex(trimmed);
    if (fromHex) return fromHex;
  }

  return null;
}

const COLUMNS =
  "id,name,place_category,address,neighborhood,phone,website,hours,description," +
  "kosher,price_range,hmo,photos,attributes,avg_rating,rec_count,is_verified,source,location";

export const getCachedPlaceById = cache(async (id: string): Promise<Place | null> => {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key to bypass RLS on the places table
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY ?? serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const restBase = url.replace(/\/+$/, "");
  const endpoint = new URL(`${restBase}/rest/v1/places`);
  endpoint.searchParams.set("id", `eq.${id}`);
  endpoint.searchParams.set("select", COLUMNS);

  let rows: unknown;
  try {
    const res = await fetch(endpoint.toString(), {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[fetch-place-by-id] PostgREST error:", res.status, await res.text());
      return null;
    }
    rows = await res.json();
  } catch (e) {
    console.error("[fetch-place-by-id] fetch threw:", e);
    return null;
  }

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0] as Record<string, unknown>;
  const coords = parseCoords(row);
  if (!coords) {
    console.error("[fetch-place-by-id] could not parse coords for", id, "location:", typeof row.location);
    return null;
  }

  const { location: _loc, ...rest } = row;
  void _loc;

  return { ...(rest as Omit<Place, "lat" | "lon">), ...coords } as Place;
});
