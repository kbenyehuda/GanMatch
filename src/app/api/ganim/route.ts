import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fetchAll = searchParams.get("all") === "1";

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        error:
          "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      },
      { status: 400 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  if (fetchAll) {
    const { data, error } = await supabase
      .rpc("get_all_ganim", { p_limit: 1000 })
      .range(0, 99_999);
    if (error) {
      console.error("[API ganim] get_all_ganim RPC error:", error);
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: 500 }
      );
    }
    return NextResponse.json(data ?? []);
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

  const { data, error } = await supabase.rpc("get_ganim_in_bbox", {
    min_lon: minLon,
    min_lat: minLat,
    max_lon: maxLon,
    max_lat: maxLat,
    p_limit: 500,
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
