import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";

// POST /api/admin/place-location-requests/decision
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
    .from("place_location_requests")
    .select("id,place_id,status,requested_lat,requested_lon,requested_address")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
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

  const { error: updateErr } = await admin
    .from("place_location_requests")
    .update({ status: "approved", moderation_reason: moderationReason, reviewed_at: now, reviewed_by: userData.user.id })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
