import "server-only";

import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

export type TelemetryPath = "review" | "bounty" | "referral" | "onboarding";

export async function logTelemetryEvent(params: {
  eventName: string;
  userId: string;
  path: TelemetryPath;
  sourceSurface: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey || !params.userId || !params.eventName) return;

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await supabaseAdmin.from("telemetry_events").insert({
      event_name: params.eventName,
      user_id: params.userId,
      path: params.path,
      source_surface: params.sourceSurface,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Best-effort only.
  }
}

