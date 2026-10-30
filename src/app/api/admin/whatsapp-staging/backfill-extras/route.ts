import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { summarizeRecommendation, getCategorySpecialties, applyPlaceExtras } from "@/lib/whatsapp-summarize";
import { factsFor } from "@/lib/place-facts";
import type { PlaceCategory } from "@/types/places";

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

// Same sizing as summarize-batch: small enough to finish inside a serverless timeout;
// the triage UI keeps calling with the returned offset until `done`.
const BATCH_SIZE = 15;
const CONCURRENCY = 5;

// POST /api/admin/whatsapp-staging/backfill-extras
// body: { offset?: number, category?: string, refresh_tags?: boolean }
//
// category limits the run to one category (e.g. "kids" to re-read only gan recommendations).
// refresh_tags adds the new fact tags to the published review's tags (kids/doctor/cosmetics only;
// existing tags are kept, the summary text and rating are not touched).
//
// For rows approved before approval learned to extract the facts the map filters on (gan type,
// outdoor space, price, doctor specialty/kupa…): re-reads each approved recommendation and fills
// those facts into its place. Only empty fields are filled (applyPlaceExtras), and the published
// summary, rating and tags are never touched, so this is safe to run more than once.
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
  try { body = await req.json(); } catch { body = {}; }
  const offset = Math.max(0, Number(body?.offset) || 0);
  const category = typeof body?.category === "string" && body.category ? body.category : null;
  const refreshTags = body?.refresh_tags === true;

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let query = admin.from("whatsapp_import_staging")
    .select("id, category, place_name, recommendation_text, source_messages, enthusiasm, created_place_id, reviewer_name")
    .eq("status", "approved")
    .not("created_place_id", "is", null);
  if (category) query = query.eq("category", category);
  const { data: rows, error: rowsErr } = await query
    .order("id", { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const specialtiesByCategory = new Map<string, string[]>();
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < (rows ?? []).length; i += CONCURRENCY) {
    const chunk = (rows ?? []).slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (row: any) => {
      try {
        if (!specialtiesByCategory.has(row.category)) {
          specialtiesByCategory.set(row.category, await getCategorySpecialties(admin, row.category));
        }
        const result = await summarizeRecommendation({
          placeName: row.place_name,
          recommendationText: row.recommendation_text,
          sourceMessages: row.source_messages,
          enthusiasm: row.enthusiasm,
          existingTags: [],
          category: row.category,
          specialtyOptions: specialtiesByCategory.get(row.category) ?? [],
        }, openaiKey);
        await applyPlaceExtras(admin, row.created_place_id, result.place_extras);
        if (refreshTags && result.tags.length > 0 && factsFor(row.category as PlaceCategory).length > 0) {
          const { data: review } = await admin.from("place_reviews").select("id, tags")
            .eq("place_id", row.created_place_id).eq("whatsapp_reviewer_name", row.reviewer_name).maybeSingle();
          if (review) {
            const current: string[] = Array.isArray(review.tags) ? review.tags : [];
            const merged = Array.from(new Set([...current, ...result.tags]));
            if (merged.length !== current.length) await admin.from("place_reviews").update({ tags: merged }).eq("id", review.id);
          }
        }
        processed += 1;
      } catch {
        failed += 1;
      }
    }));
  }

  const count = (rows ?? []).length;
  return NextResponse.json({ processed, failed, next_offset: offset + count, done: count < BATCH_SIZE });
}
