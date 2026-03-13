import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { grantReviewQuota } from "@/lib/entitlements/service";

function parseAges(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    const n = Number(item);
    if (!Number.isFinite(n)) continue;
    const age = Math.floor(n);
    if (age < 0 || age > 18) continue;
    out.push(age);
  }
  return out;
}

function textOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

export async function POST(req: Request) {
  if (!serverEnv.FF_SOFT_GATE || !serverEnv.FF_ONBOARDING_UNLOCK) {
    return NextResponse.json({ error: "Onboarding unlock disabled" }, { status: 403 });
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const city = textOrNull((body as any)?.city);
  const numberOfKidsRaw = Number((body as any)?.number_of_kids);
  const numberOfKids = Number.isFinite(numberOfKidsRaw) ? Math.floor(numberOfKidsRaw) : 0;
  const kidsAges = parseAges((body as any)?.kids_ages);
  const neighborhood = textOrNull((body as any)?.neighborhood);
  const budgetRange = textOrNull((body as any)?.budget_range);

  if (!city) {
    return NextResponse.json({ error: "Missing city" }, { status: 400 });
  }
  if (numberOfKids <= 0 || numberOfKids > 20) {
    return NextResponse.json({ error: "Invalid number_of_kids" }, { status: 400 });
  }
  if (kidsAges.length === 0) {
    return NextResponse.json({ error: "Missing kids_ages" }, { status: 400 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const profilePayload = {
    user_id: userData.user.id,
    city,
    number_of_kids: numberOfKids,
    kids_ages: kidsAges,
    neighborhood,
    budget_range: budgetRange,
    updated_at: new Date().toISOString(),
  };
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("user_onboarding_profiles")
    .upsert(profilePayload, { onConflict: "user_id" })
    .select("id")
    .single();
  if (profileErr || !profile?.id) {
    return NextResponse.json({ error: profileErr?.message ?? "Failed to save onboarding profile" }, { status: 500 });
  }

  const grant = await grantReviewQuota({
    userId: userData.user.id,
    source: "onboarding",
    quota: serverEnv.ENTITLEMENT_ONBOARDING_REVIEW_QUOTA,
    sourceRef: String(profile.id),
    metadata: {
      city,
      number_of_kids: numberOfKids,
      kids_ages: kidsAges,
      neighborhood,
      budget_range: budgetRange,
    },
  });

  return NextResponse.json({
    success: true,
    entitlement_id: grant.id,
    inserted: grant.inserted,
    review_quota_granted: serverEnv.ENTITLEMENT_ONBOARDING_REVIEW_QUOTA,
  });
}

