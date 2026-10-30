import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

const PAGE = 1000;

// No request params, so Next would prerender this at build time and freeze the tags.
export const dynamic = "force-dynamic";

// GET /api/places/review-tags — { tags: { [place_id]: string[] } }, distinct tags per place.
// Lets the list and filters count facts that parents mention (src/lib/place-facts.ts)
// without loading every review.
export async function GET() {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }
  const db = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const byPlace = new Map<string, Set<string>>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("place_reviews")
      .select("place_id, tags")
      .not("tags", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const row of data ?? []) {
      const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
      if (!tags.length) continue;
      const set = byPlace.get(row.place_id) ?? new Set<string>();
      tags.forEach((t) => set.add(t));
      byPlace.set(row.place_id, set);
    }
    if (!data || data.length < PAGE) break;
  }

  const tags = Object.fromEntries(Array.from(byPlace, ([id, set]) => [id, Array.from(set)]));
  return NextResponse.json({ tags }, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } });
}
