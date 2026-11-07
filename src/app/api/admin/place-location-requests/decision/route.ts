import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { applyPlaceLocation } from "@/lib/server/place-owners";

// POST /api/admin/place-location-requests/decision
// body: { id, action: "approve" | "reject" | "revert" | "seen", moderation_reason? }
// "revert" puts an owner's auto-applied pin move back; "seen" keeps it and takes it off the pending queue.
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
  if (!["approve", "reject", "revert", "seen"].includes(action)) {
    return NextResponse.json({ error: "action must be approve, reject, revert or seen" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing, error: existingErr } = await admin
    .from("place_location_requests")
    .select("id,place_id,status,requested_lat,requested_lon,requested_address,previous_lat,previous_lon,previous_address,auto_applied,reverted_at")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (action === "seen" || action === "revert") {
    if (!existing.auto_applied || existing.reverted_at) {
      return NextResponse.json({ error: "Only an owner move that wasn't undone yet" }, { status: 409 });
    }
    const stamp = new Date().toISOString();
    if (action === "revert") {
      const err = await applyPlaceLocation(admin, existing.place_id, existing.previous_lat, existing.previous_lon, existing.previous_address);
      if (err) return NextResponse.json({ error: err }, { status: 500 });
    }
    const { error: markErr } = await admin.from("place_location_requests")
      .update(action === "revert"
        ? { reverted_at: stamp, reverted_by: userData.user.id, admin_seen_at: stamp, moderation_reason: moderationReason }
        : { admin_seen_at: stamp })
      .eq("id", id);
    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
  }

  const now = new Date().toISOString();

  if (action === "reject") {
    const { error: updateErr } = await admin
      .from("place_location_requests")
      .update({ status: "rejected", moderation_reason: moderationReason, reviewed_at: now, reviewed_by: userData.user.id })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Approve: apply to the real place row, then mark the request approved.
  const { error: rpcErr } = await admin.rpc("update_place_location", {
    p_id: existing.place_id,
    p_lat: existing.requested_lat,
    p_lon: existing.requested_lon,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  if (existing.requested_address) {
    await admin.from("places").update({ address: existing.requested_address }).eq("id", existing.place_id);
  }

  // A dropped pin is exact, so drop the "approximate" (middle of the street) mark.
  const { data: placeRow } = await admin.from("places").select("attributes").eq("id", existing.place_id).single();
  const attrs = (placeRow?.attributes ?? {}) as Record<string, unknown>;
  if ("location_precision" in attrs) {
    const { location_precision: _dropped, ...rest } = attrs;
    await admin.from("places").update({ attributes: rest }).eq("id", existing.place_id);
  }

  const { error: updateErr } = await admin
    .from("place_location_requests")
    .update({ status: "approved", moderation_reason: moderationReason, reviewed_at: now, reviewed_by: userData.user.id })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
