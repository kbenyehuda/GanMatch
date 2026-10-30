import "server-only";

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";

/** The admin's service-role client, or an error response for anyone else. */
export async function requireAdmin(req: Request): Promise<{ admin: SupabaseClient; error?: undefined } | { error: NextResponse; admin?: undefined }> {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return { error: NextResponse.json({ error: "Supabase config missing" }, { status: 500 }) };
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if (!serverEnv.ADMIN_EMAILS.has(email)) {
    return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  }
  await ensureAdminFullAccessForUser({ userId: userData.user.id, email });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { admin };
}
