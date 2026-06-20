import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { summarizeRecommendation, getCategoryTags, recordNewTags, syncSummaryToPlaceReview } from "@/lib/whatsapp-summarize";

function adminAuth(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h;
}

// Kept small so each call finishes comfortably within a serverless function's
// timeout — the triage UI calls this repeatedly until `done` comes back true.
const BATCH_SIZE = 15;
const CONCURRENCY = 5;

// POST /api/admin/whatsapp-staging/summarize-batch
// body: { category?: string }
//
// Intentionally scoped to status="approved" only. Pending rows are summarized
// either on demand (the per-row "✨ הצע סיכום" button) or automatically the
// moment they're approved — this endpoint exists purely to backfill rows that
// were already approved before summarization existed (verbatim text still
// live in place_reviews), so it never touches anything awaiting a decision.
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
  const category = typeof body?.category === "string" ? body.category.trim() : "";

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  let q = admin.from("whatsapp_import_staging")
    .select("id, category, place_name, recommendation_text, source_messages, enthusiasm, reviewer_name, created_place_id")
    .eq("status", "approved")
    .eq("is_summarized", false)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (category) q = q.eq("category", category);

  const { data: rows, error: rowsErr } = await q;
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const tagsByCategory = new Map<string, string[]>();
  let processed = 0;
  let failed = 0;
  let synced = 0;

  for (let i = 0; i < (rows ?? []).length; i += CONCURRENCY) {
    const chunk = (rows ?? []).slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async (row: any) => {
      try {
        if (!tagsByCategory.has(row.category)) {
          tagsByCategory.set(row.category, await getCategoryTags(admin, row.category));
        }
        const result = await summarizeRecommendation({
          placeName: row.place_name,
          recommendationText: row.recommendation_text,
          sourceMessages: row.source_messages,
          enthusiasm: row.enthusiasm,
          existingTags: tagsByCategory.get(row.category) ?? [],
        }, openaiKey);

        await admin.from("whatsapp_import_staging").update({
          summary_text: result.summary || null,
          rating: result.rating,
          tags: result.tags,
          is_summarized: true,
        }).eq("id", row.id);
        await recordNewTags(admin, row.category, result.tags);

        processed += 1;

        if (row.created_place_id) {
          const ok = await syncSummaryToPlaceReview(admin, {
            placeId: row.created_place_id,
            reviewerName: row.reviewer_name,
            text: result.summary || null,
            rating: result.rating,
            tags: result.tags,
          });
          if (ok) synced += 1;
        }
      } catch {
        failed += 1;
      }
    }));
  }

  return NextResponse.json({ processed, failed, synced, done: (rows ?? []).length < BATCH_SIZE });
}
