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
  const missingSummary = searchParams.get("missing_summary") === "true";
  const search = (searchParams.get("search") ?? "").trim();

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let q = admin.from("whatsapp_import_staging")
    .select("*", { count: "exact" })
    .order("merge_group_id", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (validStatus) q = q.eq("status", status);
  if (category) q = q.eq("category", category);
  // "Ignore" in the triage UI parks a row as category=other/specialty=unknown
  // without changing its status, so it stays pending but should drop out of the
  // default (no category filter) pending view until someone explicitly looks
  // at the "other" category bucket.
  else if (status === "pending") q = q.or("category.neq.other,specialty.neq.unknown,specialty.is.null");
  if (hasContext) q = q.not("source_messages", "is", null).not("source_messages", "eq", "[]");
  if (missingSummary) q = q.eq("is_summarized", false);
  if (search) q = q.ilike("place_name", `%${search}%`);
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
  // Tracks which "kind" of field (source dialogue vs. generated summary/rating/tags)
  // was touched most recently, in the order keys actually appear in the request body —
  // each save in the UI is its own single-field PATCH, so this is really just "which
  // single save happened last." Kept order-based (not a hardcoded winner) so that if a
  // future call ever sends both at once, whichever was listed later still wins.
  const SOURCE_FIELDS = new Set(["recommendation_text", "source_messages"]);
  const GENERATED_FIELDS = new Set(["summary_text", "rating", "tags"]);
  let lastTouchedKind: "source" | "generated" | null = null;
  for (const key of Object.keys(body ?? {})) {
    if (SOURCE_FIELDS.has(key)) lastTouchedKind = "source";
    else if (GENERATED_FIELDS.has(key)) lastTouchedKind = "generated";
  }

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
  if (body?.kosher !== undefined) {
    update.kosher = body.kosher === "CERTIFIED" || body.kosher === "NOT_CERTIFIED" ? body.kosher : null;
  }
  if (body?.hours !== undefined) {
    update.hours = typeof body.hours === "string" && body.hours.trim() ? body.hours.trim() : null;
  }
  if (body?.friday_schedule !== undefined) {
    update.friday_schedule = ["NONE", "EVERY_FRIDAY", "EVERY_OTHER_FRIDAY"].includes(body.friday_schedule) ? body.friday_schedule : null;
  }
  if (body?.has_mamad !== undefined) {
    update.has_mamad = typeof body.has_mamad === "boolean" ? body.has_mamad : null;
  }
  if (body?.has_cctv !== undefined) {
    update.has_cctv = typeof body.has_cctv === "boolean" ? body.has_cctv : null;
  }
  if (body?.source_messages !== undefined) {
    if (!Array.isArray(body.source_messages)) return NextResponse.json({ error: "source_messages must be array" }, { status: 400 });
    update.source_messages = (body.source_messages as unknown[]).filter((m): m is string => typeof m === "string");
  }
  if (body?.recommendation_text !== undefined) {
    const text = typeof body.recommendation_text === "string" ? body.recommendation_text.trim() : "";
    if (!text) return NextResponse.json({ error: "recommendation_text cannot be empty" }, { status: 400 });
    update.recommendation_text = text;
  }
  if (body?.summary_text !== undefined) {
    const text = typeof body.summary_text === "string" ? body.summary_text.trim() : "";
    update.summary_text = text || null;
  }
  if (body?.rating !== undefined) {
    const rating = Number(body.rating);
    if (![1, 2, 4, 5].includes(rating)) return NextResponse.json({ error: "rating must be 1, 2, 4 or 5" }, { status: 400 });
    update.rating = rating;
  }
  if (body?.tags !== undefined) {
    if (!Array.isArray(body.tags)) return NextResponse.json({ error: "tags must be array" }, { status: 400 });
    update.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map(t => t.trim());
  }

  // Whichever "kind" of field was touched most recently wins: editing the source
  // dialogue invalidates any existing summary/rating/tags (stale input); editing
  // the summary/rating/tags themselves finalizes them.
  if (lastTouchedKind === "source") {
    update.is_summarized = false;
  } else if (lastTouchedKind === "generated") {
    update.is_summarized = true;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await admin.from("whatsapp_import_staging").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
