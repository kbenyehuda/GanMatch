import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import {
  backfillAdminFullAccessFromConfig,
  ensureAdminFullAccessForUser,
} from "@/lib/entitlements/service";

export async function GET(req: Request) {
  const supabaseUrl = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase server env missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ is_admin: false }, { status: 200 });
  }

  const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  const email = String(userData?.user?.email ?? "").trim().toLowerCase();
  if (userErr || !userData?.user || !email) {
    return NextResponse.json({ is_admin: false }, { status: 200 });
  }

  const isAdmin = serverEnv.ADMIN_EMAILS.has(email);
  if (isAdmin) {
    await ensureAdminFullAccessForUser({ userId: userData.user.id, email });
    await backfillAdminFullAccessFromConfig();
  }
  return NextResponse.json({ is_admin: isAdmin });
}

