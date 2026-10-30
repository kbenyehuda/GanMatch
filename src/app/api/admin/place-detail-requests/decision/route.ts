import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { applyKidsChanges } from "@/lib/kids-attributes";

// POST /api/admin/place-detail-requests/decision — approve applies the change set to the place
// body: { id, action: "approve" | "reject", moderation_reason? }
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

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!serverEnv.ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  await ensureAdminFullAccessForUser({ userId: userData.user.id, email });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const moderationReason =
    typeof body?.moderation_reason === "string" ? body.moderation_reason.trim() || null : null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing, error: existingErr } = await admin
    .from("place_detail_requests")
    .select("id,place_id,status,changes")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const markAs = (status: "approved" | "rejected") =>
    admin.from("place_detail_requests")
      .update({ status, moderation_reason: moderationReason, reviewed_at: now, reviewed_by: userData.user.id })
      .eq("id", id);

  if (action === "reject") {
    const { error: updateErr } = await markAs("rejected");
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Approve: apply to the place as it is now (other requests may have changed it since).
  const { data: place, error: placeErr } = await admin
    .from("places").select("attributes, hours, kosher").eq("id", existing.place_id).single();
  if (placeErr || !place) return NextResponse.json({ error: "Place not found" }, { status: 404 });

  const { error: applyErr } = await admin.from("places")
    .update(applyKidsChanges(place, existing.changes as Record<string, unknown>))
    .eq("id", existing.place_id);
  if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 });

  const { error: updateErr } = await markAs("approved");
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
