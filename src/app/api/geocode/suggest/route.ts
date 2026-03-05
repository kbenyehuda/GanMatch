import { NextRequest, NextResponse } from "next/server";

function getMapboxToken() {
  return (
    (process.env.MAPBOX_ACCESS_TOKEN || "").trim() ||
    (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() ||
    null
  );
}

const CITY_CENTERS: Record<string, { lon: number; lat: number }> = {
  "גבעתיים": { lon: 34.8117, lat: 32.0702 },
  "תל אביב": { lon: 34.7818, lat: 32.0853 },
  "תל אביב-יפו": { lon: 34.7818, lat: 32.0853 },
  "רמת גן": { lon: 34.8107, lat: 32.0823 },
};

function parseNumber(v: string | null) {
  if (!v) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const city = (searchParams.get("city") || "").trim();

  if (q.length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const token = getMapboxToken();
  if (!token) {
    return NextResponse.json(
      { error: "Missing Mapbox token (MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN)" },
      { status: 500 }
    );
  }

  const query = city && !q.includes(city) ? `${q}, ${city}` : q;
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("autocomplete", "true");
  url.searchParams.set("limit", "5");
  url.searchParams.set("types", "address,poi,place");

  const proximityLon = parseNumber(searchParams.get("proximityLon"));
  const proximityLat = parseNumber(searchParams.get("proximityLat"));
  const cityCenter = CITY_CENTERS[city];
  const prox = proximityLon !== null && proximityLat !== null ? { lon: proximityLon, lat: proximityLat } : cityCenter;
  if (prox) {
    url.searchParams.set("proximity", `${prox.lon},${prox.lat}`);
  }

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) {
      return NextResponse.json({ error: `Suggest failed (${resp.status})` }, { status: 502 });
    }

    const data = (await resp.json()) as any;
    const features = Array.isArray(data?.features) ? data.features : [];
    const suggestions = features
      .map((f: any) => {
        const center = Array.isArray(f?.center) ? f.center : null;
        const lon = Number(center?.[0]);
        const lat = Number(center?.[1]);
        if (!isFinite(lon) || !isFinite(lat)) return null;
        const placeType = Array.isArray(f?.place_type) ? f.place_type : [];
        return {
          id: typeof f?.id === "string" ? f.id : `${lon},${lat}`,
          place_name: typeof f?.place_name === "string" ? f.place_name : "",
          lon,
          lat,
          place_type: placeType as string[],
        };
      })
      .filter(Boolean);

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    return NextResponse.json(
      { error: typeof e?.message === "string" ? e.message : "Suggest error" },
      { status: 500 }
    );
  }
}

