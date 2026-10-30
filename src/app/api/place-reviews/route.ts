import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { checkReview } from "@/lib/review-check";
import { HOLD_REASON_LABELS } from "@/lib/hold-reasons";
import { escapeHtml, notifyAdmins, requestLinksHtml } from "@/lib/admin-notify";

function supabaseAdmin() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The signed-in caller's id from the Bearer token, or null for guests / bad tokens. */
async function callerId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data } = await userClient.auth.getUser();
  return data?.user?.id ?? null;
}

// The public API can't read place_reviews.user_id or whatsapp_reviewer_name (column grants), so
// recommendations by the same person can't be linked together. Reads go through the service role
// here, and the writer's id never leaves the server: the response says only whether it's yours.
//
// GET /api/place-reviews?place_id=<uuid>  — reviews for a place (is_mine needs a Bearer token)
// GET /api/place-reviews?mine=1           — how many reviews the signed-in caller wrote (Bearer token)
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("place_id")?.trim();
  // `user_id` is the old spelling of `mine`; the value is ignored, the token decides whose count it is
  const mine = req.nextUrl.searchParams.has("mine") || req.nextUrl.searchParams.has("user_id");

  if (!placeId && !mine) {
    return NextResponse.json({ error: "Missing place_id or mine" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }
  const me = await callerId(req);

  if (mine) {
    if (!me) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { count, error } = await db
      .from("place_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ count: count ?? 0 });
  }

  // The service role skips RLS: a hidden place's recommendations name the person, so none are returned
  const { data: hiddenPlace } = await db.from("places").select("id").eq("id", placeId!).eq("is_hidden", true).maybeSingle();
  if (hiddenPlace) return NextResponse.json({ reviews: [] });

  const { data, error } = await db
    .from("place_reviews")
    .select("id, user_id, rating, text, tags, is_anonymous, allow_contact, reviewer_public_name, created_at, check_status")
    .eq("place_id", placeId!)
    .eq("is_hidden", false)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const reviews = (data ?? []).map(({ user_id, ...rest }) => ({ ...rest, is_mine: me != null && user_id === me }));
  return NextResponse.json({ reviews });
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

  // Optional community-sourced kids attributes — anyone with access can fill in
  // gaps the app already knows how to store (price, vacancy) via their review.
  const rawPrice = (body as Record<string, unknown>)?.monthly_price_nis;
  const monthlyPriceNis =
    typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0 && rawPrice <= 30000
      ? rawPrice
      : null;
  const rawVacancy = (body as Record<string, unknown>)?.vacancy_status;
  const vacancyStatus =
    typeof rawVacancy === "string" && ["Available", "Limited", "Full"].includes(rawVacancy)
      ? rawVacancy
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

  // Automatic check before publishing: anything flagged, or a 1–2 star rating, waits for an admin
  const { data: placeRow } = await admin.from("places").select("name").eq("id", placeId).maybeSingle();
  const placeName = String(placeRow?.name ?? "");
  const check = await checkReview({ placeName, rating, text });

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
        is_hidden: !check.publish,
        check_status: check.publish ? "auto_ok" : "held",
        hold_reasons: check.publish ? null : check.reasons,
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

  // Fold in any community-sourced attributes the reviewer supplied. Best-effort:
  // a failure here shouldn't fail the review submission that already succeeded.
  if (monthlyPriceNis != null || vacancyStatus != null) {
    const { data: existingPlace } = await admin.from("places").select("attributes").eq("id", placeId).single();
    const attrs = { ...((existingPlace?.attributes as Record<string, unknown>) ?? {}) };
    if (monthlyPriceNis != null) attrs.monthly_price_nis = monthlyPriceNis;
    if (vacancyStatus != null) attrs.vacancy_status = vacancyStatus;
    await admin.from("places").update({ attributes: attrs, updated_at: new Date().toISOString() }).eq("id", placeId);
  }

  if (!check.publish) {
    const reasons = check.reasons.map((r) => HOLD_REASON_LABELS[r]).join(", ");
    await notifyAdmins({
      subject: `המלצה ממתינה לאישור: ${placeName}`,
      html: `<p>המלצה חדשה על <b>${escapeHtml(placeName)}</b> נשמרה מוסתרת: ${escapeHtml(reasons)}.</p>
        <p>דירוג: ${rating} מתוך 5</p>
        ${text ? `<blockquote style="border-inline-start:3px solid #ccc;padding-inline-start:8px">${escapeHtml(text)}</blockquote>` : ""}
        ${requestLinksHtml(req.nextUrl.origin, "held-reviews", inserted.id)}`,
    });
  }

  return NextResponse.json({ success: true, id: inserted.id, held: !check.publish });
}
