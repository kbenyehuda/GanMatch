import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import * as crypto from "crypto";

const GIVATAYIM = { lat: 32.0702, lon: 34.8117 };

async function geocode(name: string, addressHint: string | null): Promise<{ lat: number; lon: number }> {
  const q = addressHint || `${name} גבעתיים ישראל`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=il`,
      { headers: { "User-Agent": "GiveMytime-PlacesImport/1.0" }, signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch { /* fall through */ }
  return GIVATAYIM;
}

function contactEmail(reviewerName: string): string {
  const hash = crypto.createHash("md5").update(reviewerName.trim()).digest("hex").slice(0, 16);
  return `whatsapp-${hash}@givemytime.local`;
}

async function getOrCreateContactUser(admin: any, reviewerName: string): Promise<string> {
  const email = contactEmail(reviewerName);
  try {
    const res = await admin.auth.admin.createUser({
      email,
      password: `WA!${email}`,
      email_confirm: true,
      user_metadata: { whatsapp_name: reviewerName },
    });
    return String(res.data.user.id);
  } catch {
    // User already exists — look them up
    const { data } = await admin.auth.admin.listUsers();
    const found = (data?.users ?? []).find((u: any) => u.email === email);
    if (found) return String(found.id);
    throw new Error(`Could not create or find user for reviewer '${reviewerName}'`);
  }
}

export async function POST(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  await ensureAdminFullAccessForUser({ userId: ud.user.id, email });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const reason = typeof body?.moderation_reason === "string" ? body.moderation_reason.trim() : null;
  const includeText: boolean = body?.include_text !== false;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (action !== "approve" && action !== "reject") return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  const { data: row, error: rowErr } = await admin.from("whatsapp_import_staging").select("*").eq("id", id).single();
  if (rowErr || !row) return NextResponse.json({ error: "Staging record not found" }, { status: 404 });
  if (row.status !== "pending") return NextResponse.json({ error: `Already ${row.status}` }, { status: 409 });

  const now = new Date().toISOString();

  if (action === "reject") {
    await admin.from("whatsapp_import_staging").update({ status: "rejected", moderation_reason: reason, reviewed_by: email, reviewed_at: now }).eq("id", id);
    return NextResponse.json({ success: true });
  }

  // ── Approve ──────────────────────────────────────────────────────────────

  // 1. Resolve place — use existing or create new
  let placeId: string = row.existing_place_id ?? null;

  if (!placeId) {
    const coords = (row.lat && row.lon)
      ? { lat: row.lat, lon: row.lon }
      : await geocode(row.place_name, row.address_hint);

    const { data: newPlaceId, error: placeErr } = await admin.rpc("insert_community_place", {
      p_name:        row.place_name,
      p_category:    row.category,
      p_lon:         coords.lon,
      p_lat:         coords.lat,
      p_address:     row.address_hint ?? null,
      p_description: null,
      p_phone:       null,
      p_website:     null,
      p_hours:       null,
      p_user_id:     null,
    });
    if (placeErr) return NextResponse.json({ error: placeErr.message }, { status: 500 });

    // Mark as whatsapp-sourced
    await admin.from("places").update({ source: "whatsapp", is_verified: false }).eq("id", newPlaceId);
    placeId = newPlaceId as string;
  }

  // 2. Create synthetic auth user for reviewer (deterministic per reviewer_name)
  let reviewerUserId: string;
  try {
    reviewerUserId = await getOrCreateContactUser(admin, row.reviewer_name);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  // 3. Insert review
  const ratingMap: Record<string, number> = { high: 5, medium: 4, negative: 2 };
  const { error: reviewErr } = await admin.from("place_reviews").insert({
    user_id:               reviewerUserId,
    place_id:              placeId,
    rating:                ratingMap[row.enthusiasm] ?? 4,
    text:                  includeText ? row.recommendation_text : null,
    reviewer_public_name:  "חבר/ה מהשכונה",
    whatsapp_reviewer_name: row.reviewer_name,
    is_anonymous:          true,
    allow_contact:         false,
  });
  if (reviewErr && !reviewErr.message.includes("duplicate") && !reviewErr.message.includes("unique")) {
    return NextResponse.json({ error: reviewErr.message }, { status: 500 });
  }

  // 4. Update staging row
  await admin.from("whatsapp_import_staging").update({
    status:           "approved",
    created_place_id: placeId,
    reviewed_by:      email,
    reviewed_at:      now,
  }).eq("id", id);

  return NextResponse.json({ success: true, place_id: placeId });
}
