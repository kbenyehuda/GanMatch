import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { checkUnsubscribe } from "@/lib/follow-alerts";

export const dynamic = "force-dynamic";

// GET/POST /api/unsubscribe?u=<userId>&t=<signature> — the link in every update email.
// Works without signing in (signed link). Turns off email updates for every saved place and for
// owner alerts. Also answers the mail apps' one-click POST (List-Unsubscribe-Post).
async function handle(req: Request, asPage: boolean) {
  const sp = new URL(req.url).searchParams;
  const userId = sp.get("u") ?? "";
  const token = sp.get("t") ?? "";
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });

  const page = (msg: string, status = 200) => new NextResponse(
    `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GiveMyTime</title></head>`
    + `<body style="font-family:Arial,sans-serif;max-width:420px;margin:60px auto;padding:0 16px;text-align:center;color:#0A2B6B"><h2>${msg}</h2><p><a href="/">חזרה לאתר</a></p></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } });

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !checkUnsubscribe(userId, token)) {
    return asPage ? page("הקישור לא תקין", 400) : NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  await admin.from("place_follows").update({ email_alerts: false, alerts_opted_in_at: null }).eq("user_id", userId);
  const { data } = await admin.auth.admin.getUserById(userId);
  if (data?.user) {
    await admin.auth.admin.updateUserById(userId, { user_metadata: { ...data.user.user_metadata, email_alerts_off: true } });
  }
  return asPage ? page("הפסקנו לשלוח לכם עדכונים במייל") : NextResponse.json({ ok: true });
}

export const GET = (req: Request) => handle(req, true);
export const POST = (req: Request) => handle(req, false);
