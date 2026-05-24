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
  const limit = parseLimit(searchParams.get("limit"), 100);
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);
  const hasContext = searchParams.get("has_context") === "true";

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let q = admin.from("whatsapp_import_staging")
    .select("*", { count: "exact" })
    .order("merge_group_id", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (validStatus) q = q.eq("status", status);
  if (category) q = q.eq("category", category);
  if (hasContext) q = q.not("source_messages", "is", null).not("source_messages", "eq", "[]");
  const { data, count, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch names for existing_place_id references
  const existingIds = Array.from(new Set((data ?? []).map((r: any) => r.existing_place_id).filter(Boolean))) as string[];
  const placeNameById: Record<string, string> = {};
  if (existingIds.length > 0) {
    const { data: places } = await admin.from("places").select("id,name").in("id", existingIds);
    for (const p of places ?? []) placeNameById[(p as any).id] = (p as any).name;
  }

  const items = (data ?? []).map((r: any) => ({
    ...r,
    existing_place_name: r.existing_place_id ? (placeNameById[r.existing_place_id] ?? null) : null,
  }));

  return NextResponse.json({ items, total: count ?? 0 });
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
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: Record<string, unknown> = {};

  if (body?.category !== undefined) {
    const cat = typeof body.category === "string" ? body.category.trim() : "";
    if (!cat || cat.length > 50) return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    update.category = cat;
  }
  if (body?.specialty !== undefined) {
    update.specialty = typeof body.specialty === "string" && body.specialty ? body.specialty : null;
  }
  if (body?.hmo !== undefined) {
    if (!Array.isArray(body.hmo)) return NextResponse.json({ error: "hmo must be array" }, { status: 400 });
    update.hmo = (body.hmo as unknown[]).filter((h): h is string => typeof h === "string");
  }
  if (body?.for_children !== undefined) {
    update.for_children = typeof body.for_children === "boolean" ? body.for_children : null;
  }
  if (body?.source_messages !== undefined) {
    if (!Array.isArray(body.source_messages)) return NextResponse.json({ error: "source_messages must be array" }, { status: 400 });
    update.source_messages = (body.source_messages as unknown[]).filter((m): m is string => typeof m === "string");
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await admin.from("whatsapp_import_staging").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
