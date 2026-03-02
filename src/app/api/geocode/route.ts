import { NextRequest, NextResponse } from "next/server";

function getMapboxToken() {
  return (
    (process.env.MAPBOX_ACCESS_TOKEN || "").trim() ||
    (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "").trim() ||
    null
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const city = (searchParams.get("city") || "").trim();

  if (q.length < 4) {
    return NextResponse.json({ error: "Missing query (q)" }, { status: 400 });
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
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,poi");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Geocode failed (${resp.status})` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as any;
    const features = Array.isArray(data?.features) ? data.features : [];
    if (features.length === 0) {
      return NextResponse.json({ error: "No results" }, { status: 404 });
    }

    const first = features[0] as any;
    const center = Array.isArray(first?.center) ? first.center : null;
    const lon = Number(center?.[0]);
    const lat = Number(center?.[1]);
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "Invalid result" }, { status: 502 });
    }

    return NextResponse.json({
      lat,
      lon,
      display_name: first.place_name ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: typeof e?.message === "string" ? e.message : "Geocode error" },
      { status: 500 }
    );
  }
}

