import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

export const dynamic = "force-dynamic";

// Saved places (❤️) of a signed-in person, with a per-place "email me updates" switch (off by default).
//  GET   → { follows: [{ place_id, email_alerts }] }
//  POST  { place_id, following: boolean }                → save / unsave
//  POST  { place_id, email_alerts: boolean }             → switch the email alerts (also saves the place)
//  POST  { merge_ids: string[] }                         → on sign-in: add the browser's saved places (alerts stay off)
// Guests keep their hearts in the browser only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function authed(req: Request): Promise<{ admin: SupabaseClient; userId: string } | NextResponse> {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { admin, userId: data.user.id };
}

export async function GET(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  const { data, error } = await a.admin.from("place_follows").select("place_id,email_alerts").eq("user_id", a.userId).limit(1000);
  if (error) return NextResponse.json({ error: "שגיאה בטעינת המועדפים" }, { status: 500 });
  return NextResponse.json({ follows: data ?? [] });
}

export async function POST(req: Request) {
  const a = await authed(req);
  if (a instanceof NextResponse) return a;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (Array.isArray(body.merge_ids)) {
    const ids = Array.from(new Set(body.merge_ids.filter((x): x is string => typeof x === "string" && UUID.test(x)))).slice(0, 200);
    if (ids.length) {
      // ignoreDuplicates: a place already saved keeps its alerts setting
      const { error } = await a.admin.from("place_follows")
        .upsert(ids.map((place_id) => ({ user_id: a.userId, place_id })), { onConflict: "user_id,place_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const placeId = typeof body.place_id === "string" ? body.place_id : "";
  if (!UUID.test(placeId)) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });

  if (typeof body.email_alerts === "boolean") {
    const on = body.email_alerts;
    const { error } = await a.admin.from("place_follows").upsert(
      { user_id: a.userId, place_id: placeId, email_alerts: on, alerts_opted_in_at: on ? new Date().toISOString() : null },
      { onConflict: "user_id,place_id" },
    );
    if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
    if (on) {
      // Switching it on again after an unsubscribe-link click is a fresh opt-in
      const { data } = await a.admin.auth.admin.getUserById(a.userId);
      if (data?.user?.user_metadata?.email_alerts_off) {
        await a.admin.auth.admin.updateUserById(a.userId, { user_metadata: { ...data.user.user_metadata, email_alerts_off: false } });
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body.following === "boolean") {
    const { error } = body.following
      ? await a.admin.from("place_follows").upsert({ user_id: a.userId, place_id: placeId }, { onConflict: "user_id,place_id", ignoreDuplicates: true })
      : await a.admin.from("place_follows").delete().eq("user_id", a.userId).eq("place_id", placeId);
    if (error) return NextResponse.json({ error: "שגיאה בשמירה" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
