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
  const lon = parseFloat(searchParams.get("lon") ?? "");
  const lat = parseFloat(searchParams.get("lat") ?? "");

  if (!isFinite(lon) || !isFinite(lat)) {
    return NextResponse.json({ error: "Missing or invalid lon, lat" }, { status: 400 });
  }

  const token = getMapboxToken();
  if (!token) {
    return NextResponse.json(
      { error: "Missing Mapbox token (MAPBOX_ACCESS_TOKEN or NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN)" },
      { status: 500 }
    );
  }

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("country", "il");
  url.searchParams.set("language", "he");
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,place");

  try {
    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Reverse geocode failed (${resp.status})` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as { features?: Array<{ place_name?: string }> };
    const features = Array.isArray(data?.features) ? data.features : [];
    const first = features[0];
    const place_name = typeof first?.place_name === "string" ? first.place_name : null;

    return NextResponse.json({ place_name });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Reverse geocode error" },
      { status: 500 }
    );
  }
}
