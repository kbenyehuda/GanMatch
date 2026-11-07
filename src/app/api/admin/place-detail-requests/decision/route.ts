import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { applyKidsChanges } from "@/lib/kids-attributes";
import { applyBasicChanges, isBasicKey } from "@/lib/place-basic-details";

/** The places update for a change set that may mix kids and basic fields. */
function placeUpdate(place: any, changes: Record<string, unknown>): Record<string, unknown> {
  const kids: Record<string, unknown> = {};
  const basic: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    // "hours" is in both sets; the kids path writes the same column
    if (isBasicKey(k) && k !== "hours") basic[k] = v; else kids[k] = v;
  }
  let update: Record<string, unknown> = {};
  if (Object.keys(basic).length) update = { ...update, ...applyBasicChanges(place, basic) };
  if (Object.keys(kids).length) {
    const withAttrs = { ...place, attributes: (update.attributes as Record<string, unknown>) ?? place.attributes };
    update = { ...update, ...applyKidsChanges(withAttrs, kids) };
  }
  return update;
}

// POST /api/admin/place-detail-requests/decision — approve applies the change set to the place
// body: { id, action: "approve" | "reject" | "revert" | "seen", moderation_reason? }
// "seen" keeps an owner's auto-applied edit and takes it off the pending queue.
// "revert" undoes an owner's auto-applied edit: the fields go back to their previous values.
// Approving a remove_listing request hides the place (places.is_hidden).
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
  if (action !== "approve" && action !== "reject" && action !== "revert" && action !== "seen") {
    return NextResponse.json({ error: "action must be approve, reject, revert or seen" }, { status: 400 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing, error: existingErr } = await admin
    .from("place_detail_requests")
    .select("id,place_id,status,changes,previous,auto_applied,reverted_at")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (action === "seen") {
    const { error: seenErr } = await admin.from("place_detail_requests")
      .update({ admin_seen_at: new Date().toISOString() }).eq("id", id).eq("auto_applied", true);
    if (seenErr) return NextResponse.json({ error: seenErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "revert") {
    if (!existing.auto_applied || existing.reverted_at) {
      return NextResponse.json({ error: "Only an owner edit that wasn't undone yet can be undone" }, { status: 409 });
    }
    const { data: place, error: placeErr } = await admin
      .from("places").select("attributes, hours, kosher").eq("id", existing.place_id).single();
    if (placeErr || !place) return NextResponse.json({ error: "Place not found" }, { status: 404 });
    const previous = (existing.previous ?? {}) as Record<string, unknown>;
    const back: Record<string, unknown> = {};
    for (const k of Object.keys(existing.changes ?? {})) back[k] = previous[k] ?? null;
    const removal = (existing.changes as Record<string, unknown>)?.remove_listing === true;
    const { error: applyErr } = removal
      ? await admin.from("places").update({ is_hidden: false, updated_at: new Date().toISOString() }).eq("id", existing.place_id)
      : await admin.from("places").update(placeUpdate(place, back)).eq("id", existing.place_id);
    if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 });
    const { error: updateErr } = await admin.from("place_detail_requests")
      .update({ reverted_at: new Date().toISOString(), reverted_by: userData.user.id, admin_seen_at: new Date().toISOString(), moderation_reason: moderationReason })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
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
    // A declined removal request puts the place back on the site (it was hidden when asked)
    if ((existing.changes as Record<string, unknown>)?.remove_listing === true) {
      const { error: showErr } = await admin.from("places").update({ is_hidden: false, updated_at: now }).eq("id", existing.place_id);
      if (showErr) return NextResponse.json({ error: showErr.message }, { status: 500 });
    }
    const { error: updateErr } = await markAs("rejected");
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // Approve: apply to the place as it is now (other requests may have changed it since).
  const { data: place, error: placeErr } = await admin
    .from("places").select("attributes, hours, kosher").eq("id", existing.place_id).single();
  if (placeErr || !place) return NextResponse.json({ error: "Place not found" }, { status: 404 });

  const changes = existing.changes as Record<string, unknown>;
  const { error: applyErr } = changes.remove_listing === true
    ? await admin.from("places").update({ is_hidden: true, updated_at: now }).eq("id", existing.place_id)
    : await admin.from("places").update(placeUpdate(place, changes)).eq("id", existing.place_id);
  if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 });

  const { error: updateErr } = await markAs("approved");
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
