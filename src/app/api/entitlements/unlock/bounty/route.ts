import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { grantFullAccess } from "@/lib/entitlements/service";

function normalizeTaskKeys(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const dedup = new Set<string>();
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim().toLowerCase();
    if (t) dedup.add(t);
  }
  return Array.from(dedup);
}

export async function POST(req: Request) {
  if (!serverEnv.FF_SOFT_GATE || !serverEnv.FF_BOUNTY_UNLOCK) {
    return NextResponse.json({ error: "Bounty unlock disabled" }, { status: 403 });
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

  const taskKeys = normalizeTaskKeys((body as any)?.task_keys);
  if (taskKeys.length < serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS) {
    return NextResponse.json(
      { error: `Need at least ${serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS} completed tasks` },
      { status: 400 }
    );
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

  const { data: completion, error: completionErr } = await supabaseAdmin
    .from("user_bounty_completions")
    .insert({
      user_id: userData.user.id,
      task_keys: taskKeys,
      task_count: taskKeys.length,
      metadata: {
        required_task_count: serverEnv.ENTITLEMENT_BOUNTY_REQUIRED_TASKS,
      },
    })
    .select("id")
    .single();
  if (completionErr || !completion?.id) {
    return NextResponse.json({ error: completionErr?.message ?? "Failed to persist bounty completion" }, { status: 500 });
  }

  const grant = await grantFullAccess({
    userId: userData.user.id,
    source: "bounty",
    durationDays: serverEnv.ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS,
    sourceRef: String(completion.id),
    metadata: {
      task_keys: taskKeys,
      task_count: taskKeys.length,
    },
  });

  return NextResponse.json({
    success: true,
    entitlement_id: grant.id,
    inserted: grant.inserted,
    full_access_days: serverEnv.ENTITLEMENT_BOUNTY_FULL_ACCESS_DAYS,
  });
}

