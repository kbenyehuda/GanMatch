import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

export type EntitlementType = "full_access" | "review_quota";
export type EntitlementSource = "review" | "bounty" | "referral" | "onboarding" | "admin";

export interface AccessSnapshot {
  canViewReviews: boolean;
  hasFullAccess: boolean;
  reviewQuotaRemaining: number;
}

type JsonMap = Record<string, unknown>;

function nowIso() {
  return new Date().toISOString();
}

function plusDaysIso(days: number) {
  const base = Date.now();
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  return new Date(base + ms).toISOString();
}

function getAdminClient() {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase server env missing");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function normalizeEmail(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

const ADMIN_BACKFILL_INTERVAL_MS = 5 * 60 * 1000;
let lastAdminBackfillAt = 0;

export async function getAccessSnapshot(userId: string, isAdmin: boolean): Promise<AccessSnapshot> {
  if (!userId) return { canViewReviews: false, hasFullAccess: false, reviewQuotaRemaining: 0 };
  if (isAdmin) return { canViewReviews: true, hasFullAccess: true, reviewQuotaRemaining: 0 };

  const supabaseAdmin = getAdminClient();
  const now = nowIso();
  const base = supabaseAdmin
    .from("user_access_entitlements")
    .select("entitlement_type,quota_remaining,starts_at,expires_at")
    .eq("user_id", userId)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`);
  const { data, error } = await base;
  if (error) throw error;

  let hasFullAccess = false;
  let reviewQuotaRemaining = 0;
  for (const row of data ?? []) {
    const entitlementType = String((row as any)?.entitlement_type ?? "");
    if (entitlementType === "full_access") hasFullAccess = true;
    if (entitlementType === "review_quota") {
      const n = Number((row as any)?.quota_remaining ?? 0);
      if (Number.isFinite(n) && n > 0) reviewQuotaRemaining += n;
    }
  }
  return {
    canViewReviews: hasFullAccess || reviewQuotaRemaining > 0,
    hasFullAccess,
    reviewQuotaRemaining,
  };
}

export async function grantFullAccess(params: {
  userId: string;
  source: EntitlementSource;
  durationDays: number;
  sourceRef?: string | null;
  metadata?: JsonMap | null;
}) {
  const supabaseAdmin = getAdminClient();
  const now = nowIso();
  const sourceRef = params.sourceRef?.trim() || null;
  if (sourceRef) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("user_access_entitlements")
      .select("id")
      .eq("user_id", params.userId)
      .eq("source", params.source)
      .eq("source_ref", sourceRef)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) return { id: String(existing.id), inserted: false as const };
  }

  const { data, error } = await supabaseAdmin
    .from("user_access_entitlements")
    .insert({
      user_id: params.userId,
      entitlement_type: "full_access",
      source: params.source,
      source_ref: sourceRef,
      starts_at: now,
      expires_at: plusDaysIso(params.durationDays),
      quota_remaining: null,
      metadata: params.metadata ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: String(data.id), inserted: true as const };
}

export async function grantReviewQuota(params: {
  userId: string;
  source: EntitlementSource;
  quota: number;
  sourceRef?: string | null;
  metadata?: JsonMap | null;
}) {
  const supabaseAdmin = getAdminClient();
  const safeQuota = Math.max(0, Math.floor(params.quota));
  const sourceRef = params.sourceRef?.trim() || null;
  if (sourceRef) {
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("user_access_entitlements")
      .select("id,quota_remaining")
      .eq("user_id", params.userId)
      .eq("source", params.source)
      .eq("source_ref", sourceRef)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing?.id) {
      const prev = Number((existing as any).quota_remaining ?? 0);
      const nextQuota = Number.isFinite(prev) ? Math.max(prev, safeQuota) : safeQuota;
      const { error: updateErr } = await supabaseAdmin
        .from("user_access_entitlements")
        .update({ quota_remaining: nextQuota, metadata: params.metadata ?? null })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
      return { id: String(existing.id), inserted: false as const };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("user_access_entitlements")
    .insert({
      user_id: params.userId,
      entitlement_type: "review_quota",
      source: params.source,
      source_ref: sourceRef,
      starts_at: nowIso(),
      expires_at: null,
      quota_remaining: safeQuota,
      metadata: params.metadata ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: String(data.id), inserted: true as const };
}

export async function consumeOneReviewQuota(userId: string): Promise<boolean> {
  if (!userId) return false;
  const supabaseAdmin = getAdminClient();
  const now = nowIso();

  // Retry a couple of times to handle concurrent consumers.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: rows, error } = await supabaseAdmin
      .from("user_access_entitlements")
      .select("id,quota_remaining")
      .eq("user_id", userId)
      .eq("entitlement_type", "review_quota")
      .gt("quota_remaining", 0)
      .lte("starts_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("starts_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    const row = (rows ?? [])[0];
    if (!row?.id) return false;

    const current = Number((row as any).quota_remaining ?? 0);
    if (!Number.isFinite(current) || current <= 0) continue;
    const nextQuota = current - 1;
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("user_access_entitlements")
      .update({
        quota_remaining: nextQuota,
        updated_at: nowIso(),
      })
      .eq("id", row.id)
      .gt("quota_remaining", 0)
      .select("id")
      .maybeSingle();
    if (updateErr) throw updateErr;
    if (updated?.id) return true;
  }

  return false;
}

export async function ensureAdminFullAccessForUser(params: {
  userId: string;
  email: string | null | undefined;
}): Promise<{ ensured: boolean }> {
  const userId = String(params.userId ?? "").trim();
  const email = normalizeEmail(params.email);
  if (!userId || !email || !serverEnv.ADMIN_EMAILS.has(email)) {
    return { ensured: false };
  }

  const supabaseAdmin = getAdminClient();
  const sourceRef = `admin_email:${email}`;

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("user_access_entitlements")
    .select("id,expires_at,metadata")
    .eq("user_id", userId)
    .eq("source", "admin")
    .eq("source_ref", sourceRef)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing?.id) {
    // Keep admin grants permanent.
    if ((existing as any).expires_at != null) {
      const { error: updateErr } = await supabaseAdmin
        .from("user_access_entitlements")
        .update({
          expires_at: null,
          metadata: { ...(existing as any).metadata, admin_email: email },
          updated_at: nowIso(),
        })
        .eq("id", existing.id);
      if (updateErr) throw updateErr;
    }
    return { ensured: true };
  }

  const { error: insertErr } = await supabaseAdmin.from("user_access_entitlements").insert({
    user_id: userId,
    entitlement_type: "full_access",
    source: "admin",
    source_ref: sourceRef,
    starts_at: nowIso(),
    expires_at: null,
    quota_remaining: null,
    metadata: { admin_email: email, sync_mode: "auto" },
  });
  if (insertErr) throw insertErr;
  return { ensured: true };
}

export async function backfillAdminFullAccessFromConfig(force = false): Promise<{ ensuredCount: number }> {
  const now = Date.now();
  if (!force && now - lastAdminBackfillAt < ADMIN_BACKFILL_INTERVAL_MS) {
    return { ensuredCount: 0 };
  }
  lastAdminBackfillAt = now;

  if (serverEnv.ADMIN_EMAILS.size === 0) return { ensuredCount: 0 };
  const supabaseAdmin = getAdminClient();

  const matchedUsers: Array<{ id: string; email: string }> = [];
  let page = 1;
  const perPage = 200;

  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) {
      const email = normalizeEmail(user.email ?? null);
      if (!email || !serverEnv.ADMIN_EMAILS.has(email)) continue;
      matchedUsers.push({ id: user.id, email });
    }
    if (users.length < perPage) break;
    page += 1;
  }

  let ensuredCount = 0;
  for (const user of matchedUsers) {
    const { ensured } = await ensureAdminFullAccessForUser({ userId: user.id, email: user.email });
    if (ensured) ensuredCount += 1;
  }
  return { ensuredCount };
}

