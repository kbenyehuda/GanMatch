import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|headless|lighthouse/i;

/** Keep only small flat values: strings ≤200 chars, numbers, booleans, string arrays. */
function cleanProps(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 20)) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((s) => typeof s === "string").slice(0, 20).map((s) => (s as string).slice(0, 60));
  }
  return Object.keys(out).length ? out : null;
}

// POST /api/telemetry/collect — visitor analytics (guests and signed-in). Best-effort, never blocks the UI.
// Admins' own visits are skipped and the client is told to stop sending.
export async function POST(req: Request) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) return NextResponse.json({ ok: false }, { status: 200 });

  if (BOT_RE.test(req.headers.get("user-agent") ?? "")) return NextResponse.json({ ok: true });

  let body: any;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = String(body?.event ?? "");
  const visitorId = String(body?.visitor_id ?? "");
  const sessionId = String(body?.session_id ?? "");
  if (!ANALYTICS_EVENTS.has(event) || !ID_RE.test(visitorId) || !ID_RE.test(sessionId)) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  const entityId = typeof body?.entity_id === "string" && body.entity_id.length <= 64 ? body.entity_id : null;

  let userId: string | null = null;
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data } = await userClient.auth.getUser();
    const email = String(data?.user?.email ?? "").trim().toLowerCase();
    if (email && serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ ok: true, ignore: true });
    userId = data?.user?.id ?? null;
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await admin.from("telemetry_events").insert({
      event_name: event,
      user_id: userId,
      visitor_id: visitorId,
      session_id: sessionId,
      source_surface: "app",
      entity_id: entityId,
      metadata: cleanProps(body?.props),
    });
  } catch {
    // Best-effort only.
  }
  return NextResponse.json({ ok: true });
}
