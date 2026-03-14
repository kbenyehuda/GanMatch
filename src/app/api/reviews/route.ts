import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import {
  consumeOneReviewQuota,
  ensureAdminFullAccessForUser,
  getAccessSnapshot,
  grantFullAccess,
} from "@/lib/entitlements/service";
import { logTelemetryEvent } from "@/lib/telemetry/log-event";

export async function GET(req: NextRequest) {
  const ganId = String(req.nextUrl.searchParams.get("gan_id") ?? "").trim();
  if (!ganId) {
    return NextResponse.json({ error: "Missing gan_id" }, { status: 400 });
  }

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
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const email = String(userData.user.email ?? "").trim().toLowerCase();
  const isAdmin = !!email && serverEnv.ADMIN_EMAILS.has(email);
  if (isAdmin) {
    await ensureAdminFullAccessForUser({ userId: userData.user.id, email });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  let consumedQuota = false;

  if (serverEnv.FF_SOFT_GATE) {
    const snapshot = await getAccessSnapshot(userData.user.id, isAdmin);
    if (!snapshot.canViewReviews) {
      return NextResponse.json({ error: "Access locked" }, { status: 403 });
    }
    if (!snapshot.hasFullAccess && snapshot.reviewQuotaRemaining > 0) {
      const consumed = await consumeOneReviewQuota(userData.user.id);
      if (!consumed) {
        return NextResponse.json({ error: "Review quota exhausted" }, { status: 403 });
      }
      consumedQuota = true;
      await logTelemetryEvent({
        eventName: "quota_consumed",
        userId: userData.user.id,
        path: "onboarding",
        sourceSurface: "gan_detail_reviews",
        entityId: ganId,
        metadata: { amount: 1 },
      });
    }
  }
  const { data, error } = await supabaseAdmin
    .from("confirmed_reviews")
    .select(
      "id,user_id,rating,is_anonymous,allow_contact,reviewer_public_name,reviewer_public_email_masked,advice_to_parents_text,enrollment_years,created_at,cleanliness_rating,staff_rating,safety_rating"
    )
    .eq("gan_id", ganId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logTelemetryEvent({
    eventName: "review_viewed",
    userId: userData.user.id,
    path: consumedQuota ? "onboarding" : "review",
    sourceSurface: "gan_detail_reviews",
    entityId: ganId,
    metadata: {
      review_count: Array.isArray(data) ? data.length : 0,
      soft_gate_enabled: serverEnv.FF_SOFT_GATE,
      consumed_quota: consumedQuota,
    },
  });

  return NextResponse.json({ reviews: data ?? [] });
}

export async function POST(req: NextRequest) {
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ganId = typeof (body as any)?.gan_id === "string" ? String((body as any).gan_id).trim() : "";
  const rating = Number((body as any)?.rating ?? NaN);
  const cleanlinessRating = Number((body as any)?.cleanliness_rating ?? NaN);
  const staffRating = Number((body as any)?.staff_rating ?? NaN);
  const safetyRating = Number((body as any)?.safety_rating ?? NaN);
  if (!ganId) return NextResponse.json({ error: "Missing gan_id" }, { status: 400 });
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const email = String(userData.user.email ?? "").trim().toLowerCase();
  const isAdmin = !!email && serverEnv.ADMIN_EMAILS.has(email);
  if (isAdmin) {
    await ensureAdminFullAccessForUser({ userId: userData.user.id, email });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("user_inputs")
    .insert({
      user_id: userData.user.id,
      email: userData.user.email ?? null,
      gan_id: ganId,
      is_new_gan: false,
      input_type: "review",
      status: "pending",
      parent_in_gan: true,
      anonymous: Boolean((body as any)?.is_anonymous ?? true),
      allows_messages: Boolean((body as any)?.allow_contact ?? true),
      free_text_rec:
        typeof (body as any)?.advice_to_parents_text === "string"
          ? String((body as any).advice_to_parents_text).trim() || null
          : null,
      metadata: {
        rating,
        cleanliness_rating: Number.isFinite(cleanlinessRating) ? cleanlinessRating : null,
        staff_rating: Number.isFinite(staffRating) ? staffRating : null,
        safety_rating: Number.isFinite(safetyRating) ? safetyRating : null,
        enrollment_years:
          typeof (body as any)?.enrollment_years === "string"
            ? String((body as any).enrollment_years).trim() || null
            : null,
        reviewer_public_name:
          typeof (body as any)?.reviewer_public_name === "string"
            ? String((body as any).reviewer_public_name).trim() || null
            : null,
        reviewer_public_email_masked:
          typeof (body as any)?.reviewer_public_email_masked === "string"
            ? String((body as any).reviewer_public_email_masked).trim() || null
            : null,
      },
    })
    .select("id")
    .single();
  if (insertErr || !inserted?.id) {
    return NextResponse.json({ error: insertErr?.message ?? "Failed to submit review" }, { status: 500 });
  }

  const inputId = String(inserted.id);
  let temporaryAccessGranted = false;
  if (serverEnv.FF_SOFT_GATE) {
    const snapshot = await getAccessSnapshot(userData.user.id, isAdmin);
    if (!snapshot.hasFullAccess) {
      try {
        await grantFullAccess({
          userId: userData.user.id,
          source: "review",
          durationDays: serverEnv.ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS,
          sourceRef: `${inputId}:submit`,
          metadata: {
            user_input_id: inputId,
            gan_id: ganId,
            trigger: "contribution_submitted",
            stage: "submit",
          },
        });
        temporaryAccessGranted = true;
        await logTelemetryEvent({
          eventName: "entitlement_granted",
          userId: userData.user.id,
          path: "review",
          sourceSurface: "review_submit_pending",
          entityId: inputId,
          metadata: {
            entitlement_type: "full_access",
            duration_days: serverEnv.ENTITLEMENT_SUBMIT_TEMP_FULL_ACCESS_DAYS,
            gan_id: ganId,
            stage: "submit",
          },
        });
      } catch {
        // Best-effort temporary unlock; don't fail contribution submission on entitlement issue.
      }
    }
  }

  await logTelemetryEvent({
    eventName: "contribution_submitted",
    userId: userData.user.id,
    path: "review",
    sourceSurface: "review_submit",
    entityId: inputId,
    metadata: { gan_id: ganId, status: "pending", temporary_access_granted: temporaryAccessGranted },
  });

  return NextResponse.json({
    success: true,
    status: "pending",
    user_input_id: inputId,
    temporary_access_granted: temporaryAccessGranted,
  });
}

