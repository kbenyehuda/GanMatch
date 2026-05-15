import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import type { Place } from "@/types/places";

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// GET /api/places?minLon=&minLat=&maxLon=&maxLat=[&categories=doctor,cafe]
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  const minLon = parseFloat(searchParams.get("minLon") ?? "");
  const minLat = parseFloat(searchParams.get("minLat") ?? "");
  const maxLon = parseFloat(searchParams.get("maxLon") ?? "");
  const maxLat = parseFloat(searchParams.get("maxLat") ?? "");

  if ([minLon, minLat, maxLon, maxLat].some((n) => isNaN(n))) {
    return NextResponse.json(
      { error: "Invalid bounds (minLon, minLat, maxLon, maxLat required)" },
      { status: 400 }
    );
  }

  // Optional: comma-separated category filter e.g. "doctor,cafe"
  const categoriesParam = searchParams.get("categories");
  const categories: string[] | null = categoriesParam
    ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const rpcParams: Record<string, unknown> = {
    min_lon: minLon,
    min_lat: minLat,
    max_lon: maxLon,
    max_lat: maxLat,
    p_limit: 500,
  };
  if (categories) rpcParams.p_categories = categories;

  const { data, error } = await supabase.rpc("get_places_in_bbox", rpcParams);

  if (error) {
    console.error("[API places] RPC error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 }
    );
  }

  return NextResponse.json((data ?? []) as Place[]);
}
