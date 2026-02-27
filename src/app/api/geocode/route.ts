import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const city = (searchParams.get("city") || "").trim();

  if (q.length < 4) {
    return NextResponse.json({ error: "Missing query (q)" }, { status: 400 });
  }

  const query = city ? `${q}, ${city}, Israel` : `${q}, Israel`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "il");

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "User-Agent": "GanMatch/0.1 (daycare finder)",
        Accept: "application/json",
        "Accept-Language": "he,en;q=0.9",
      },
      // Nominatim is shared infra; avoid aggressive caching client-side
      cache: "no-store",
    });

    if (!resp.ok) {
      return NextResponse.json(
        { error: `Geocode failed (${resp.status})` },
        { status: 502 }
      );
    }

    const data = (await resp.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "No results" }, { status: 404 });
    }

    const first = data[0] as any;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!isFinite(lat) || !isFinite(lon)) {
      return NextResponse.json({ error: "Invalid result" }, { status: 502 });
    }

    return NextResponse.json({
      lat,
      lon,
      display_name: first.display_name ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: typeof e?.message === "string" ? e.message : "Geocode error" },
      { status: 500 }
    );
  }
}

