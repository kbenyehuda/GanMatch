import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import type { Place } from "@/types/places";

// GET /api/places/search?q=<text>[&limit=20][&categories=doctor,cafe]
export async function GET(request: NextRequest) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  const limitParam = searchParams.get("limit");
  const pLimit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100)
    : 20;

  const categoriesParam = searchParams.get("categories");
  const categoryList = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // Try the search_places RPC (full lat/lon support, requires migration 20260515100000).
  // Falls back to a direct table query if the function doesn't exist yet.
  const { data: rpcData, error: rpcError } = await supabase.rpc("search_places", {
    p_query: q,
    p_limit: pLimit,
    p_categories: categoryList,
  });

  if (!rpcError) {
    return NextResponse.json({ places: (rpcData ?? []) as Place[] });
  }

  // PGRST202 = function not found (migration not applied yet) — fall back to direct query
  if (rpcError.code !== "PGRST202") {
    console.error("[API places/search] RPC error:", rpcError);
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // Fallback: direct table query (no lat/lon — distance won't show until migration is applied)
  let fallback = supabase
    .from("places")
    .select(
      "id, name, place_category, address, neighborhood, avg_rating, rec_count, is_verified, photos, kosher, price_range, hmo, attributes"
    )
    .or(`name.ilike.%${q}%,address.ilike.%${q}%`)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(pLimit);

  if (categoryList) {
    fallback = fallback.in("place_category", categoryList);
  }

  const { data: fallbackData, error: fallbackError } = await fallback;
  if (fallbackError) {
    console.error("[API places/search] fallback error:", fallbackError);
    return NextResponse.json({ error: fallbackError.message }, { status: 500 });
  }

  return NextResponse.json({ places: (fallbackData ?? []) as Partial<Place>[] });
}
