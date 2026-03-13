import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { getAccessSnapshot } from "@/lib/entitlements/service";

export async function GET(req: Request) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase server env missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({
      enabled: serverEnv.FF_SOFT_GATE,
      can_view_reviews: false,
      is_admin: false,
      has_full_access: false,
      review_quota_remaining: 0,
      defaults: {
        review_full_access_days: serverEnv.ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS,
        bounty_full_access_days: serverEnv.ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS,
        bounty_required_tasks: serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS,
        onboarding_review_quota: serverEnv.ENTITLEMENT_ONBOARDING_REVIEW_QUOTA,
      },
      feature_flags: {
        bounty_unlock: serverEnv.FF_BOUNTY_UNLOCK,
        referral_unlock: serverEnv.FF_REFERRAL_UNLOCK,
        onboarding_unlock: serverEnv.FF_ONBOARDING_UNLOCK,
      },
    });
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

  let snapshot = { canViewReviews: false, hasFullAccess: false, reviewQuotaRemaining: 0 };
  if (serverEnv.FF_SOFT_GATE) {
    snapshot = await getAccessSnapshot(userData.user.id, isAdmin);
  } else {
    snapshot = {
      canViewReviews: true,
      hasFullAccess: false,
      reviewQuotaRemaining: 0,
    };
  }

  return NextResponse.json({
    enabled: serverEnv.FF_SOFT_GATE,
    can_view_reviews: snapshot.canViewReviews,
    is_admin: isAdmin,
    has_full_access: snapshot.hasFullAccess,
    review_quota_remaining: snapshot.reviewQuotaRemaining,
    defaults: {
      review_full_access_days: serverEnv.ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS,
      bounty_full_access_days: serverEnv.ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS,
      bounty_required_tasks: serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS,
      onboarding_review_quota: serverEnv.ENTITLEMENT_ONBOARDING_REVIEW_QUOTA,
    },
    feature_flags: {
      bounty_unlock: serverEnv.FF_BOUNTY_UNLOCK,
      referral_unlock: serverEnv.FF_REFERRAL_UNLOCK,
      onboarding_unlock: serverEnv.FF_ONBOARDING_UNLOCK,
    },
  });
}

