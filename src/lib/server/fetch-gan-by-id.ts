import "server-only";

import { cache } from "react";
import { publicEnv } from "@/lib/env/public";
import { mapGanApiRow } from "@/lib/gan-row-map";
import type { Gan } from "@/types/ganim";

/** PostgREST only — avoids bundling @supabase/supabase-js into RSC (fixes missing vendor-chunks/@supabase.js). */

/** PostGIS EWKB Point (with optional SRID), little-endian — common when PostgREST returns geography as hex. */
function parseEwkbPointHex(hex: string): { lat: number; lon: number } | null {
  const clean = hex.replace(/\s+/g, "");
  if (!/^[0-9a-fA-F]+$/i.test(clean) || clean.length < 40) return null;
  const buf = Buffer.from(clean, "hex");
  if (buf.length < 21) return null;
  const le = buf.readUInt8(0) === 1;
  if (!le) return null;
  let o = 1;
  const readU32 = () => {
    const v = buf.readUInt32LE(o);
    o += 4;
    return v;
  };
  const readF64 = () => {
    const v = buf.readDoubleLE(o);
    o += 8;
    return v;
  };
  let wkbType = readU32();
  const hasSrid = (wkbType & 0x20000000) !== 0;
  const type = wkbType & 0xff;
  if (hasSrid) readU32();
  if (type !== 1) return null;
  const x = readF64();
  const y = readF64();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { lon: x, lat: y };
}

function extractLatLonFromRow(row: Record<string, unknown>): { lat: number; lon: number } | null {
  if (row.lat != null && row.lon != null) {
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }

  const loc = row.location;

  if (loc && typeof loc === "object" && loc !== null && "coordinates" in loc) {
    const c = (loc as { coordinates?: unknown }).coordinates;
    if (Array.isArray(c) && c.length >= 2) {
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  if (typeof loc === "string") {
    const trimmed = loc.trim().replace(/^SRID=\d+;\s*/i, "");
    if (trimmed.startsWith("{")) {
      try {
        const j = JSON.parse(trimmed) as { type?: string; coordinates?: unknown };
        if (j.type === "Point" && Array.isArray(j.coordinates) && j.coordinates.length >= 2) {
          const lon = Number(j.coordinates[0]);
          const lat = Number(j.coordinates[1]);
          if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
        }
      } catch {
        /* ignore */
      }
    }
    const wkt = trimmed.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
    if (wkt) {
      const lon = Number(wkt[1]);
      const lat = Number(wkt[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    const fromHex = parseEwkbPointHex(trimmed);
    if (fromHex) return fromHex;
  }

  return null;
}

type RestRowResult =
  | { ok: true; row: Record<string, unknown> | null }
  | { ok: false; status: number; message: string };

async function fetchGanimV2Row(
  restBase: string,
  anonKey: string,
  id: string,
  select: string
): Promise<RestRowResult> {
  const u = new URL(`${restBase}/rest/v1/ganim_v2`);
  u.searchParams.set("id", `eq.${id}`);
  u.searchParams.set("select", select);

  const res = await fetch(u.toString(), {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  }

  if (!res.ok) {
    const msg =
      json && typeof json === "object" && "message" in json
        ? String((json as { message?: unknown }).message)
        : text.slice(0, 200);
    return { ok: false, status: res.status, message: msg };
  }

  if (!Array.isArray(json)) {
    return { ok: false, status: res.status, message: "unexpected PostgREST response" };
  }

  if (json.length === 0) {
    return { ok: true, row: null };
  }

  return { ok: true, row: json[0] as Record<string, unknown> };
}

export const getCachedGanById = cache(async (id: string): Promise<Gan | null> => {
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("[GanMatch] gan by id: missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return null;
  }

  const restBase = url.replace(/\/+$/, "");

  const selectWithCoords = "*,lat:ST_Y(location::geometry),lon:ST_X(location::geometry)";
  let row: Record<string, unknown> | null = null;

  const withCoords = await fetchGanimV2Row(restBase, anonKey, id, selectWithCoords);

  if (!withCoords.ok) {
    console.warn(
      "[GanMatch] gan by id: ST_Y/ST_X select failed, using plain *:",
      withCoords.status,
      withCoords.message
    );

    const plain = await fetchGanimV2Row(restBase, anonKey, id, "*");
    if (!plain.ok) {
      console.error("[GanMatch] gan by id:", plain.status, plain.message);
      return null;
    }
    if (!plain.row) return null;
    row = plain.row;
  } else if (!withCoords.row) {
    return null;
  } else {
    row = withCoords.row;
  }

  const coords = extractLatLonFromRow(row);
  if (!coords) {
    console.error(
      "[GanMatch] gan by id: could not parse location for",
      id,
      "location type:",
      row.location === null || row.location === undefined
        ? String(row.location)
        : typeof row.location
    );
    return null;
  }

  return mapGanApiRow({ ...row, lat: coords.lat, lon: coords.lon });
});
