import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import {
  ensureAdminFullAccessForUser,
  getAccessSnapshot,
} from "@/lib/entitlements/service";

type UserInputRow = Record<string, unknown>;

const NON_CONTRIBUTION_KEYS = new Set([
  "id",
  "user_id",
  "email",
  "created_at",
  "gan_id",
  "is_new_gan",
  "input_type",
  "status",
  "moderation_reason",
  "reviewed_at",
  "reviewed_by",
  "parent_in_gan",
  "anonymous",
  "allows_messages",
  "free_text_rec",
]);

function countChangedFieldsForEditRow(row: UserInputRow): number {
  let count = 0;
  for (const [key, value] of Object.entries(row)) {
    if (NON_CONTRIBUTION_KEYS.has(key)) continue;
    if (key === "metadata") {
      if (value && typeof value === "object") {
        for (const metaValue of Object.values(value as Record<string, unknown>)) {
          if (metaValue !== null && metaValue !== undefined && String(metaValue).trim() !== "") {
            count += 1;
          }
        }
      }
      continue;
    }
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      count += 1;
    }
  }
  return count;
}

export async function GET(req: Request) {
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

  const { data: inputRows, error: inputErr } = await supabaseAdmin
    .from("user_inputs")
    .select("*")
    .eq("user_id", userData.user.id)
    .in("input_type", ["review", "edit"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (inputErr) {
    return NextResponse.json({ error: inputErr.message }, { status: 500 });
  }

  const rows = (inputRows ?? []) as UserInputRow[];
  const reviewRows = rows.filter((r) => r.input_type === "review");
  const editRows = rows.filter((r) => r.input_type === "edit");

  const latestReview = reviewRows[0] ?? null;
  const latestEdit = editRows[0] ?? null;

  const hasWrittenReviewSubmission = reviewRows.some((r) =>
    typeof r.free_text_rec === "string" && r.free_text_rec.trim().length > 0
  );
  const hasStarsSubmission = reviewRows.some((r) => {
    const md = r.metadata;
    if (!md || typeof md !== "object") return false;
    return Number.isFinite(Number((md as Record<string, unknown>).rating ?? NaN));
  });

  const latestEditChangedFields = latestEdit ? countChangedFieldsForEditRow(latestEdit) : 0;
  const bestEditChangedFields = editRows.reduce((max, row) => {
    const n = countChangedFieldsForEditRow(row);
    return n > max ? n : max;
  }, 0);

  const thresholdX = Math.max(1, Math.floor(serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS));
  const qualifiesByMissingData = bestEditChangedFields >= thresholdX;
  const qualifiesByReviewOrStars = hasWrittenReviewSubmission || hasStarsSubmission;
  const qualifiesOnSubmit = qualifiesByReviewOrStars || qualifiesByMissingData;

  const snapshot = serverEnv.FF_SOFT_GATE
    ? await getAccessSnapshot(userData.user.id, isAdmin)
    : { canViewReviews: true, hasFullAccess: false, reviewQuotaRemaining: 0 };

  const now = new Date().toISOString();
  const { data: activeEntitlements, error: entErr } = await supabaseAdmin
    .from("user_access_entitlements")
    .select("entitlement_type,source,source_ref,starts_at,expires_at,quota_remaining,created_at")
    .eq("user_id", userData.user.id)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: false });
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 });
  }

  const activeRows = activeEntitlements ?? [];
  const effectiveStatus = snapshot.hasFullAccess
    ? "full_access"
    : snapshot.reviewQuotaRemaining > 0
      ? "review_quota"
      : "no_access";
  const effectiveSource = snapshot.hasFullAccess
    ? String(activeRows.find((r: any) => r.entitlement_type === "full_access")?.source ?? "")
    : snapshot.reviewQuotaRemaining > 0
      ? String(activeRows.find((r: any) => r.entitlement_type === "review_quota")?.source ?? "")
      : null;

  return NextResponse.json({
    user_id: userData.user.id,
    is_admin: isAdmin,
    threshold_x: thresholdX,
    mission: {
      qualifies_on_submit: qualifiesOnSubmit,
      has_written_review_submission: hasWrittenReviewSubmission,
      has_stars_submission: hasStarsSubmission,
      latest_review_status: latestReview ? String(latestReview.status ?? "") : null,
      latest_edit_status: latestEdit ? String(latestEdit.status ?? "") : null,
      latest_edit_changed_fields: latestEditChangedFields,
      best_edit_changed_fields: bestEditChangedFields,
      review_submissions: reviewRows.length,
      edit_submissions: editRows.length,
      pending_count: rows.filter((r) => String(r.status ?? "") === "pending").length,
      approved_count: rows.filter((r) => String(r.status ?? "") === "approved").length,
    },
    access: {
      can_view_reviews: snapshot.canViewReviews,
      has_full_access: snapshot.hasFullAccess,
      review_quota_remaining: snapshot.reviewQuotaRemaining,
      effective_status: effectiveStatus,
      effective_source: effectiveSource,
      active_entitlements: activeRows,
    },
  });
}

