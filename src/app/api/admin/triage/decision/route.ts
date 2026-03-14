import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser, grantFullAccess } from "@/lib/entitlements/service";
import { logTelemetryEvent } from "@/lib/telemetry/log-event";

function toReviewPayload(row: Record<string, unknown>): Record<string, unknown> {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const ratingRaw = Number(meta.rating ?? NaN);
  const rating = Number.isFinite(ratingRaw) ? ratingRaw : 3.0;
  return {
    user_id: row.user_id,
    gan_id: row.gan_id,
    rating,
    cleanliness_rating: meta.cleanliness_rating ?? null,
    staff_rating: meta.staff_rating ?? null,
    communication_rating: meta.communication_rating ?? null,
    food_rating: meta.food_rating ?? null,
    location_rating: meta.location_rating ?? null,
    safety_rating: meta.safety_rating ?? null,
    advice_to_parents_text:
      typeof row.free_text_rec === "string" && row.free_text_rec.trim()
        ? row.free_text_rec.trim()
        : null,
    enrollment_years:
      typeof meta.enrollment_years === "string" && meta.enrollment_years.trim()
        ? meta.enrollment_years.trim()
        : null,
    is_anonymous: row.anonymous ?? true,
    allow_contact: row.allows_messages ?? true,
    reviewer_public_name:
      typeof meta.reviewer_public_name === "string" ? meta.reviewer_public_name : null,
    reviewer_public_email_masked:
      typeof meta.reviewer_public_email_masked === "string"
        ? meta.reviewer_public_email_masked
        : null,
    updated_at: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase server env missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (!serverEnv.ADMIN_EMAILS.has(email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  await ensureAdminFullAccessForUser({ userId: userData.user.id, email });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof (body as any)?.id === "string" ? String((body as any).id) : "";
  const status = typeof (body as any)?.status === "string" ? String((body as any).status) : "";
  const moderationReason =
    typeof (body as any)?.moderation_reason === "string"
      ? String((body as any).moderation_reason).trim()
      : null;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("user_inputs")
    .select("id,status,input_type,gan_id,user_id,free_text_rec,anonymous,allows_messages,metadata")
    .eq("id", id)
    .single();
  if (existingErr || !existing) {
    return NextResponse.json({ error: "Input not found" }, { status: 404 });
  }

  const { error: updateErr } = await supabaseAdmin
    .from("user_inputs")
    .update({
      status,
      moderation_reason: moderationReason || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userData.user.id,
    })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (
    status === "approved" &&
    (existing.input_type === "review" || existing.input_type === "edit") &&
    typeof existing.user_id === "string" &&
    existing.user_id
  ) {
    const path = existing.input_type === "review" ? "review" : "bounty";
    await logTelemetryEvent({
      eventName: "contribution_approved",
      userId: existing.user_id,
      path,
      sourceSurface: "admin_triage_decision",
      entityId: id,
      metadata: { gan_id: existing.gan_id ?? null },
    });
  }

  // Materialize approved reviews immediately so avg/count update without waiting for background worker.
  if (
    status === "approved" &&
    existing.input_type === "review" &&
    typeof existing.user_id === "string" &&
    existing.user_id &&
    existing.gan_id
  ) {
    const payload = toReviewPayload(existing as Record<string, unknown>);
    const { error: reviewUpsertErr } = await supabaseAdmin
      .from("confirmed_reviews")
      .upsert(payload, { onConflict: "user_id,gan_id" });
    if (reviewUpsertErr) {
      return NextResponse.json({ error: reviewUpsertErr.message }, { status: 500 });
    }
  }

  if (
    serverEnv.FF_SOFT_GATE &&
    status === "approved" &&
    (existing.input_type === "review" || existing.input_type === "edit") &&
    typeof existing.user_id === "string" &&
    existing.user_id
  ) {
    const grantSource = existing.input_type === "review" ? "review" : "bounty";
    const path = existing.input_type === "review" ? "review" : "bounty";
    try {
      await grantFullAccess({
        userId: existing.user_id,
        source: grantSource,
        durationDays: serverEnv.ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS,
        sourceRef: `${id}:approved`,
        metadata: { user_input_id: id, gan_id: existing.gan_id ?? null, stage: "approved" },
      });
      await logTelemetryEvent({
        eventName: "entitlement_granted",
        userId: existing.user_id,
        path,
        sourceSurface: "admin_triage_decision",
        entityId: id,
        metadata: {
          entitlement_type: "full_access",
          duration_days: serverEnv.ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS,
          gan_id: existing.gan_id ?? null,
          stage: "approved",
        },
      });
    } catch (entitlementErr) {
      const message =
        entitlementErr instanceof Error ? entitlementErr.message : "Failed to grant review entitlement";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Keep visual status in sync for suggested ganim that already exist in ganim_v2.
  if (existing.input_type === "suggest_gan" && existing.gan_id) {
    const { error: ganErr } = await supabaseAdmin
      .from("ganim_v2")
      .update({
        is_verified: status === "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.gan_id);
    if (ganErr) {
      return NextResponse.json({ error: ganErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

