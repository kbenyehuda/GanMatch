import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { summarizeRecommendation, getCategoryTags, recordNewTags, syncSummaryToPlaceReview, applyKidsFieldsToPlace, pickKidsStructuredFields } from "@/lib/whatsapp-summarize";

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

// POST /api/admin/whatsapp-staging/summarize — generate (and persist) a legal-safe,
// anonymized summary + rating + tags for one staging row. Triggered manually from
// the triage UI. If the row is already approved, also pushes the result into the
// live place_reviews row (this is how individual already-published rows get fixed).
export async function POST(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc, OPENAI_API_KEY: openaiKey } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });
  if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });

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

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: row, error: rowErr } = await admin
    .from("whatsapp_import_staging")
    .select("category, place_name, recommendation_text, source_messages, enthusiasm, reviewer_name, status, created_place_id")
    .eq("id", id)
    .single();
  if (rowErr || !row) return NextResponse.json({ error: "Staging record not found" }, { status: 404 });

  const existingTags = await getCategoryTags(admin, row.category);

  let result;
  try {
    result = await summarizeRecommendation({
      placeName: row.place_name,
      recommendationText: row.recommendation_text,
      sourceMessages: row.source_messages,
      enthusiasm: row.enthusiasm,
      existingTags,
      category: row.category,
    }, openaiKey);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Summarize failed" }, { status: 500 });
  }

  const kidsFields = pickKidsStructuredFields(result);
  await admin.from("whatsapp_import_staging").update({
    summary_text: result.summary || null,
    rating: result.rating,
    tags: result.tags,
    is_summarized: true,
    ...kidsFields,
  }).eq("id", id);
  await recordNewTags(admin, row.category, result.tags);

  let syncedToReview = false;
  if (row.status === "approved" && row.created_place_id) {
    syncedToReview = await syncSummaryToPlaceReview(admin, {
      placeId: row.created_place_id,
      reviewerName: row.reviewer_name,
      text: result.summary || null,
      rating: result.rating,
      tags: result.tags,
    });
    if (row.category === "kids") await applyKidsFieldsToPlace(admin, row.created_place_id, kidsFields);
  }

  return NextResponse.json({ ...result, syncedToReview });
}
