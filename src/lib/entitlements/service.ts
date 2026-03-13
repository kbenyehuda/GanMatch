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

