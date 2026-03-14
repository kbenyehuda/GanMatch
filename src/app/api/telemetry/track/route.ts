import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { logTelemetryEvent, type TelemetryPath } from "@/lib/telemetry/log-event";

const ALLOWED_EVENTS = new Set([
  "lock_wall_viewed",
  "unlock_path_selected",
  "contribution_submitted",
  "contribution_approved",
  "entitlement_granted",
  "review_viewed",
  "quota_consumed",
]);

const ALLOWED_PATHS = new Set<TelemetryPath>(["review", "bounty", "referral", "onboarding"]);

export async function POST(req: Request) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
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

  const eventName = String((body as any)?.event_name ?? "").trim();
  const path = String((body as any)?.path ?? "").trim() as TelemetryPath;
  const sourceSurface = String((body as any)?.source_surface ?? "").trim();
  const entityIdRaw = (body as any)?.entity_id;
  const entityId = typeof entityIdRaw === "string" ? entityIdRaw : null;
  const metadata = (body as any)?.metadata;

  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "Invalid event_name" }, { status: 400 });
  }
  if (!ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (!sourceSurface) {
    return NextResponse.json({ error: "Missing source_surface" }, { status: 400 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !userData?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  await logTelemetryEvent({
    eventName,
    userId: userData.user.id,
    path,
    sourceSurface,
    entityId,
    metadata: metadata && typeof metadata === "object" ? metadata : null,
  });

  return NextResponse.json({ success: true });
}

