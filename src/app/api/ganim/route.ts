import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const minLon = parseFloat(searchParams.get("minLon") ?? "");
  const minLat = parseFloat(searchParams.get("minLat") ?? "");
  const maxLon = parseFloat(searchParams.get("maxLon") ?? "");
  const maxLat = parseFloat(searchParams.get("maxLat") ?? "");

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    [minLon, minLat, maxLon, maxLat].some((n) => isNaN(n))
  ) {
    return NextResponse.json(
      {
        error: !supabaseUrl || !supabaseAnonKey
          ? "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)"
          : "Invalid bounds (minLon, minLat, maxLon, maxLat required)",
      },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.rpc("get_ganim_in_bbox", {
    min_lon: minLon,
    min_lat: minLat,
    max_lon: maxLon,
    max_lat: maxLat,
    p_limit: 100,
  });

  if (error) {
    console.error("[API ganim] RPC error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
