import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { requireAdmin } from "@/lib/server/require-admin";
import { sendFollowAlerts } from "@/lib/follow-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/admin/follow-alerts-test — sends the update email ONLY to the signed-in admin, built from
// the last 7 days of real changes on any place. Nobody else is emailed.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data } = await userClient.auth.getUser();
  if (!data?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const result = await sendFollowAlerts(auth.admin, new URL(req.url).origin, { userId: data.user.id, hours: 24 * 7 });
  return NextResponse.json({ ...result, to: data.user.email });
}
