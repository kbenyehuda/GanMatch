import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";

function parseLimit(raw: string | null, fallback = 50000): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

export async function GET(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = adminAuth(req);
  if (!authHeader) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  await ensureAdminFullAccessForUser({ userId: ud.user.id, email });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const validStatus = status === "pending" || status === "approved" || status === "rejected";
  const category = searchParams.get("category") ?? "";
  const limit = parseLimit(searchParams.get("limit"));

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let q = admin.from("whatsapp_import_staging").select("*").order("merge_group_id", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(limit);
  if (validStatus) q = q.eq("status", status);
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch names for existing_place_id references
  const existingIds = [...new Set((data ?? []).map((r: any) => r.existing_place_id).filter(Boolean))] as string[];
  const placeNameById: Record<string, string> = {};
  if (existingIds.length > 0) {
    const { data: places } = await admin.from("places").select("id,name").in("id", existingIds);
    for (const p of places ?? []) placeNameById[(p as any).id] = (p as any).name;
  }

  const items = (data ?? []).map((r: any) => ({
    ...r,
    existing_place_name: r.existing_place_id ? (placeNameById[r.existing_place_id] ?? null) : null,
  }));

  return NextResponse.json({ items });
}

export async function PATCH(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = adminAuth(req);
  if (!authHeader) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = typeof body?.id === "string" ? body.id : "";
  const category = typeof body?.category === "string" ? body.category : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!category || category.length > 50) return NextResponse.json({ error: "Invalid category" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await admin.from("whatsapp_import_staging").update({ category }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
