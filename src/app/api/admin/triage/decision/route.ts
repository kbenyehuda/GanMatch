import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { grantFullAccess } from "@/lib/entitlements/service";

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
    .select("id,status,input_type,gan_id,user_id")
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
    serverEnv.FF_SOFT_GATE &&
    status === "approved" &&
    existing.input_type === "review" &&
    typeof existing.user_id === "string" &&
    existing.user_id
  ) {
    try {
      await grantFullAccess({
        userId: existing.user_id,
        source: "review",
        durationDays: serverEnv.ENTITLEMENT_REVIEW_FULL_ACCESS_DAYS,
        sourceRef: id,
        metadata: { user_input_id: id, gan_id: existing.gan_id ?? null },
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

