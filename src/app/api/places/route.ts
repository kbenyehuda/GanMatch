import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { serverEnv } from "@/lib/env/server";
import type { Place, PlaceCategory } from "@/types/places";
import { escapeHtml, notifyAdmins, requestLinksHtml } from "@/lib/admin-notify";
import { checkReview } from "@/lib/review-check";
import { HOLD_REASON_LABELS } from "@/lib/hold-reasons";
import { checkNewPlace } from "@/lib/place-check";
import { PLACE_HOLD_LABELS } from "@/lib/place-hold-reasons";
import { cleanPlaceName } from "@/lib/place-name";

const VALID_CATEGORIES: PlaceCategory[] = [
  "doctor", "clinic", "cafe", "kids", "sport", "attraction", "food", "cosmetics",
];

// Same data for every visitor (anon read), so the CDN can serve it without hitting the database.
// A new/edited place can take up to a minute to show.
const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// GET /api/places?minLon=&minLat=&maxLon=&maxLat=&[categories=doctor,cafe]
// GET /api/places?all=1 — every place in the city, including ones with no pin (lat/lon null)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  if (searchParams.get("all") === "1") {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.rpc("get_all_places", { p_limit: 5000 });
    if (error) {
      console.error("[API places] get_all_places RPC error:", error);
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }
    return NextResponse.json((data ?? []) as Place[], { headers: PUBLIC_CACHE_HEADERS });
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

  // The RPC orders by rating, so a low cap silently drops every unrated place
  // (i.e. everything newly approved). The whole city is a few hundred rows.
  const rpcParams: Record<string, unknown> = {
    min_lon: minLon, min_lat: minLat, max_lon: maxLon, max_lat: maxLat,
    p_limit: 2000,
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

  return NextResponse.json((data ?? []) as Place[], { headers: PUBLIC_CACHE_HEADERS });
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
  // A private person (babysitter, caregiver) is saved hidden until she agrees to be listed
  // (place_consents, /admin/consents). She has no public location, and we need a way to ask her.
  const isPrivatePerson = category === "kids" && body.is_private_person === true;
  const consentContact = typeof body.consent_contact === "string" ? body.consent_contact.trim().slice(0, 200) : "";
  if (isPrivatePerson && !consentContact)
    return NextResponse.json({ error: "נא לכתוב מייל או טלפון כדי שנוכל לבקש את הסכמתה" }, { status: 400 });
  if (!isPrivatePerson && (lon === null || lat === null || !isFinite(lon) || !isFinite(lat)))
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

  const cleanName = cleanPlaceName(name, category);

  // The same place added again within a day (a retry when the site was slow, or two people adding the
  // same business) returns the one that already exists instead of making a duplicate (2026-11-18:
  // one dietitian was added twice during the outage).
  const { data: existing } = isPrivatePerson ? { data: null } : await admin.from("places")
    .select("id").eq("source", "community").eq("is_hidden", false).eq("name", cleanName)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: true }).limit(1).maybeSingle();

  // Insert the place using raw SQL so we can use ST_MakePoint
  let inserted: unknown = existing?.id ?? null;
  let insertErr: { message: string } | null = null;
  if (!existing) {
    const res = await admin.rpc("insert_community_place", {
      p_name: cleanName,
      p_category: category,
      p_lon: isPrivatePerson ? null : lon,
      p_lat: isPrivatePerson ? null : lat,
      p_address: isPrivatePerson ? null : address,
      p_description: description,
      p_phone: phone ? [phone] : null,
      p_website: website,
      p_hours: hours,
      p_user_id: userData.user.id,
    });
    inserted = res.data;
    insertErr = res.error;
  }

  if (insertErr || !inserted) {
    // Fallback: if RPC doesn't exist yet, return a helpful error
    console.error("[API places POST] RPC error:", insertErr);
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to insert place" },
      { status: 500 }
    );
  }

  const placeId = inserted as string;

  if (isPrivatePerson) {
    const { error: hideErr } = await admin.from("places")
      .update({ is_hidden: true, attributes: { specialty: "בייביסיטר" } }).eq("id", placeId);
    const { error: consentErr } = hideErr ? { error: hideErr } :
      await admin.from("place_consents").insert({ place_id: placeId, contact: consentContact });
    if (hideErr || consentErr) {
      // Never leave a private person visible: undo the insert
      await admin.from("places").delete().eq("id", placeId);
      return NextResponse.json({ error: (hideErr ?? consentErr)?.message ?? "Failed to save" }, { status: 500 });
    }
  }

  // Automatic check of the place itself (name and description), decision 2026-11-18: a clean place is shown at
  // once, a flagged one (or one the check couldn't run on) is saved hidden and waits in /admin/held-places.
  let placeHeld = false;
  if (!isPrivatePerson && !existing) {
    const pc = await checkNewPlace({ name: cleanName, category, description });
    if (!pc.publish) {
      placeHeld = true;
      await admin.from("places").update({
        is_hidden: true,
        attributes: { place_hold: { reasons: pc.reasons, at: new Date().toISOString() } },
      }).eq("id", placeId);
      await notifyAdmins({
        subject: `מקום חדש ממתין לאישור: ${cleanName}`,
        html: `<p>נוסף מקום חדש <b>${escapeHtml(cleanName)}</b> והוא נשמר מוסתר: ${escapeHtml(pc.reasons.map((r) => PLACE_HOLD_LABELS[r]).join(", "))}.</p>
          ${description ? `<blockquote style="border-inline-start:3px solid #ccc;padding-inline-start:8px">${escapeHtml(description)}</blockquote>` : ""}
          ${requestLinksHtml(new URL(request.url).origin, "held-places", placeId)}`,
      });
    }
  }

  // Optional first recommendation. It goes through the same automatic check as any other
  // recommendation: before 2026-11-18 it skipped the check and was published at once.
  let reviewPublished = false;
  if (reviewRating !== null && reviewRating >= 1 && reviewRating <= 5) {
    const { data: mine } = await admin.from("place_reviews").select("id")
      .eq("user_id", userData.user.id).eq("place_id", placeId).maybeSingle();
    if (!mine) {
      const check = await checkReview({ placeName: cleanName, rating: reviewRating, text: reviewText });
      const { data: review } = await admin.from("place_reviews").insert({
        user_id: userData.user.id,
        place_id: placeId,
        rating: reviewRating,
        text: reviewText,
        is_anonymous: reviewAnonymous,
        reviewer_public_name: reviewerName,
        is_hidden: !check.publish,
        check_status: check.publish ? "auto_ok" : "held",
        hold_reasons: check.publish ? null : check.reasons,
        approved_at: check.publish ? new Date().toISOString() : null,
      }).select("id").single();
      reviewPublished = !!review?.id && check.publish;
      if (!check.publish && review?.id) {
        await notifyAdmins({
          subject: `המלצה ממתינה לאישור: ${cleanName}`,
          html: `<p>המלצה חדשה על <b>${escapeHtml(cleanName)}</b> (נוספה יחד עם מקום חדש) נשמרה מוסתרת: ${escapeHtml(check.reasons.map((r) => HOLD_REASON_LABELS[r]).join(", "))}.</p>
            <p>דירוג: ${reviewRating} מתוך 5</p>
            ${reviewText ? `<blockquote style="border-inline-start:3px solid #ccc;padding-inline-start:8px">${escapeHtml(reviewText)}</blockquote>` : ""}
            ${requestLinksHtml(new URL(request.url).origin, "held-reviews", review.id)}`,
        });
      }
    }
  }

  if (isPrivatePerson) {
    await notifyAdmins({
      subject: `בקשת הסכמה חדשה: ${name}`,
      html: `<h2>נוספה המלצה על אדם פרטי</h2>
        <p><strong>${escapeHtml(name)}</strong> נשמרה מוסתרת עד שתסכים להופיע באתר.</p>
        <p>פרטי קשר שנמסרו: ${escapeHtml(consentContact)}</p>
        <p><a href="${new URL(request.url).origin}/admin/consents" style="display:inline-block;background:#0A2B6B;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:bold">לרשימת ההסכמות</a></p>`,
    });
    return NextResponse.json({ hidden: true }, { status: 201 });
  }

  // A held place is not shown on the map: the form tells the person it will appear after a short check
  if (placeHeld) return NextResponse.json({ hidden: true, held: true }, { status: 201 });

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
    avg_rating: reviewPublished ? reviewRating : null,
    rec_count: reviewPublished ? 1 : 0,
    is_verified: false,
    source: "community",
    lat,
    lon,
  };

  return NextResponse.json({ place: newPlace }, { status: 201 });
}
