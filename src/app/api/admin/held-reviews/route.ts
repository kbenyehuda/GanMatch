import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";

/** The admin's service-role client, or an error response for anyone else. */
async function requireAdmin(req: Request) {
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

// GET /api/admin/held-reviews — recommendations saved hidden (flagged by the check, or 1–2 stars)
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.admin
    .from("place_reviews")
    .select("id,place_id,rating,text,hold_reasons,reviewer_public_name,created_at,places(name,address,place_category)")
    .eq("is_hidden", true)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/admin/held-reviews  body: { id, action: "approve" | "delete" }
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = body.action;
  if (!id || (action !== "approve" && action !== "delete")) {
    return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
  }

  // The trigger on place_reviews recalculates the place's rating and count either way
  const { error } = action === "approve"
    ? await auth.admin.from("place_reviews").update({ is_hidden: false, check_status: "approved", hold_reasons: null }).eq("id", id).eq("is_hidden", true)
    : await auth.admin.from("place_reviews").delete().eq("id", id).eq("is_hidden", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
