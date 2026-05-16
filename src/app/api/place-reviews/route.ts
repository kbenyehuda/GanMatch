import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

function supabaseAnon() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function supabaseAdmin() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// GET /api/place-reviews?place_id=<uuid>  — reviews for a place
// GET /api/place-reviews?user_id=<uuid>   — reviews submitted by a user (count only)
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("place_id")?.trim();
  const userId = req.nextUrl.searchParams.get("user_id")?.trim();

  if (!placeId && !userId) {
    return NextResponse.json({ error: "Missing place_id or user_id" }, { status: 400 });
  }

  const db = supabaseAnon();
  if (!db) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }

  if (userId) {
    const { count, error } = await db
      .from("place_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  }

  const { data, error } = await db
    .from("place_reviews")
    .select("id, user_id, rating, text, is_anonymous, reviewer_public_name, created_at")
    .eq("place_id", placeId!)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ reviews: data ?? [] });
}

// POST /api/place-reviews
// body: { place_id, rating, text?, is_anonymous?, reviewer_public_name? }
export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placeId =
    typeof (body as Record<string, unknown>)?.place_id === "string"
      ? String((body as Record<string, unknown>).place_id).trim()
      : "";
  const rating = Number((body as Record<string, unknown>)?.rating ?? NaN);
  const text =
    typeof (body as Record<string, unknown>)?.text === "string"
      ? String((body as Record<string, unknown>).text).trim() || null
      : null;
  const isAnonymous = Boolean(
    (body as Record<string, unknown>)?.is_anonymous ?? true
  );
  const reviewerPublicName =
    !isAnonymous &&
    typeof (body as Record<string, unknown>)?.reviewer_public_name === "string"
      ? String((body as Record<string, unknown>).reviewer_public_name).trim() || null
      : null;

  if (!placeId) {
    return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Invalid rating (1–5)" }, { status: 400 });
  }

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

  // Upsert — unique constraint (user_id, place_id) means one review per user per place
  const { data: inserted, error: insertErr } = await admin
    .from("place_reviews")
    .upsert(
      {
        user_id: userData.user.id,
        place_id: placeId,
        rating,
        text,
        is_anonymous: isAnonymous,
        reviewer_public_name: reviewerPublicName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,place_id" }
    )
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to submit review" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, id: inserted.id });
}
