import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

async function verifyAdmin(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return { error: "Supabase env missing", status: 500 as const };

  const authHeader = adminAuth(req);
  if (!authHeader) return { error: "Authentication required", status: 401 as const };

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return { error: "Authentication required", status: 401 as const };
  if (!serverEnv.ADMIN_EMAILS.has(email)) return { error: "Admin access required", status: 403 as const };

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return { admin };
}

function tableFor(req: Request): "specialty_taxonomy" | "tag_taxonomy" {
  const type = new URL(req.url).searchParams.get("type");
  return type === "tag" ? "tag_taxonomy" : "specialty_taxonomy";
}

export async function GET(req: Request) {
  const result = await verifyAdmin(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { admin } = result;

  const { data, error } = await admin
    .from(tableFor(req))
    .select("category, name")
    .order("category")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row.name);
  }

  return NextResponse.json({ taxonomy: grouped });
}

export async function POST(req: Request) {
  const result = await verifyAdmin(req);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  const { admin } = result;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!category || !name) return NextResponse.json({ error: "Missing category or name" }, { status: 400 });

  const { data, error } = await admin
    .from(tableFor(req))
    .upsert({ category, name }, { onConflict: "category,name" })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ row: data });
}
