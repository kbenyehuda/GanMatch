import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import type { Place, PlaceCategory } from "@/types/places";

const VALID_CATEGORIES: PlaceCategory[] = [
  "doctor", "cafe", "kids", "sport", "attraction", "food", "cosmetics",
];

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// GET /api/places?minLon=&minLat=&maxLon=&maxLat=&[categories=doctor,cafe]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const minLon = parseFloat(searchParams.get("minLon") ?? "");
  const minLat = parseFloat(searchParams.get("minLat") ?? "");
  const maxLon = parseFloat(searchParams.get("maxLon") ?? "");
  const maxLat = parseFloat(searchParams.get("maxLat") ?? "");

  if ([minLon, minLat, maxLon, maxLat].some((v) => !isFinite(v))) {
    return NextResponse.json(
      { error: "minLon, minLat, maxLon, maxLat are required" },
      { status: 400 }
    );
  }

  // Optional: comma-separated category filter e.g. "doctor,cafe"
  const categoriesParam = searchParams.get("categories");
  const categories: string[] | null = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const rpcParams: Record<string, unknown> = {
    min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat,
    p_limit: 200,
  };
  if (categories) rpcParams.p_categories = categories;

  const { data, error } = await supabase.rpc("get_places_in_bbox", rpcParams);

  if (error) {
    console.error("[API places] RPC error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as Place[]);
}

// POST /api/places — add a new community place
export async function POST(request: NextRequest) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate required fields
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const category = typeof body.place_category === "string" ? body.place_category as PlaceCategory : null;
  const lon = typeof body.lon === "number" ? body.lon : null;
  const lat = typeof body.lat === "number" ? body.lat : null;

  if (!name) return NextResponse.json({ error: "שם המקום נדרש" }, { status: 400 });
  if (!category || !VALID_CATEGORIES.includes(category))
    return NextResponse.json({ error: "קטגוריה לא תקינה" }, { status: 400 });
  if (lon === null || lat === null || !isFinite(lon) || !isFinite(lat))
    return NextResponse.json({ error: "מיקום נדרש" }, { status: 400 });

  // Optional fields
  const address = typeof body.address === "string" ? body.address.trim() || null : null;
  const description = typeof body.description === "string" ? body.description.trim() || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  const website = typeof body.website === "string" ? body.website.trim() || null : null;
  const hours = typeof body.hours === "string" ? body.hours.trim() || null : null;

  // Optional initial review
  const reviewRating = typeof body.review_rating === "number" ? body.review_rating : null;
  const reviewText = typeof body.review_text === "string" ? body.review_text.trim() || null : null;
  const reviewAnonymous = body.review_is_anonymous !== false;
  const reviewerName = !reviewAnonymous && typeof body.reviewer_public_name === "string"
    ? body.reviewer_public_name.trim() || null
    : null;

  // Verify user
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Insert the place using raw SQL so we can use ST_MakePoint
  const { data: inserted, error: insertErr } = await admin.rpc("insert_community_place", {
    p_name: name,
    p_category: category,
    p_lon: lon,
    p_lat: lat,
    p_address: address,
    p_description: description,
    p_phone: phone ? [phone] : null,
    p_website: website,
    p_hours: hours,
    p_user_id: userData.user.id,
  });

  if (insertErr || !inserted) {
    // Fallback: if RPC doesn't exist yet, return a helpful error
    console.error("[API places POST] RPC error:", insertErr);
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to insert place" },
      { status: 500 }
    );
  }

  const placeId = inserted as string;

  // Optional review
  if (reviewRating !== null && reviewRating >= 1 && reviewRating <= 5) {
    await admin.from("place_reviews").insert({
      user_id: userData.user.id,
      place_id: placeId,
      rating: reviewRating,
      text: reviewText,
      is_anonymous: reviewAnonymous,
      reviewer_public_name: reviewerName,
    });
  }

  // Return the new place as a full Place object
  const newPlace: Place = {
    id: placeId,
    name,
    place_category: category,
    address,
    neighborhood: null,
    phone: phone ? [phone] : null,
    website,
    hours,
    description,
    kosher: null,
    price_range: null,
    hmo: null,
    photos: [],
    attributes: {},
    avg_rating: reviewRating,
    rec_count: reviewRating ? 1 : 0,
    is_verified: false,
    source: "community",
    lat,
    lon,
  };

  return NextResponse.json({ place: newPlace }, { status: 201 });
}
