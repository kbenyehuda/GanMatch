import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Place } from "@/types/places";

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// GET /api/places/search?q=<text>[&limit=10][&categories=doctor,cafe]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ places: [] });
  }

  const limitParam = searchParams.get("limit");
  const pLimit = limitParam
    ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100)
    : 10;

  const categoriesParam = searchParams.get("categories");
  const categoryList = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  let query = supabase
    .from("places")
    .select(
      "id, name, place_category, address, neighborhood, avg_rating, rec_count, is_verified, photos, lat:location->1, lon:location->0"
    )
    .or(`name.ilike.%${q}%,address.ilike.%${q}%,description.ilike.%${q}%`)
    .order("avg_rating", { ascending: false, nullsFirst: false })
    .limit(pLimit);

  if (categoryList) {
    query = query.in("place_category", categoryList);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[API places/search] query error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 }
    );
  }

  return NextResponse.json({ places: (data ?? []) as Partial<Place>[] });
}
