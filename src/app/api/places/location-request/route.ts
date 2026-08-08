import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { getCachedPlaceById } from "@/lib/server/fetch-place-by-id";

// POST /api/places/location-request — request a pin-location change for an
// existing place. Always pending; an admin must approve before the place's
// real location changes (see /api/admin/place-location-requests/decision).
export async function POST(req: Request) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placeId = typeof body.place_id === "string" ? body.place_id : "";
  const lat = typeof body.lat === "number" ? body.lat : NaN;
  const lon = typeof body.lon === "number" ? body.lon : NaN;
  const address = typeof body.address === "string" ? body.address.trim() || null : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "מיקום לא תקין" }, { status: 400 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const place = await getCachedPlaceById(placeId);
  if (!place) return NextResponse.json({ error: "מקום לא נמצא" }, { status: 404 });

  // No-op guard: requested point ~1m or less from the current one.
  if (place.lat != null && place.lon != null) {
    const same = Math.abs(place.lat - lat) < 0.00001 && Math.abs(place.lon - lon) < 0.00001;
    if (same) return NextResponse.json({ error: "המיקום שנבחר זהה למיקום הנוכחי" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: inserted, error: insertErr } = await admin
    .from("place_location_requests")
    .insert({
      place_id: placeId,
      user_id: userData.user.id,
      requested_lat: lat,
      requested_lon: lon,
      requested_address: address,
      note,
      previous_lat: place.lat,
      previous_lon: place.lon,
      previous_address: place.address,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "שגיאה בשמירת הבקשה" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: inserted.id,
    message: "הבקשה נשלחה וממתינה לאישור מנהל.",
  });
}
