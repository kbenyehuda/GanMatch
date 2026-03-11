import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";

const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitParam = searchParams.get("limit");
  const pLimit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 10, 1), 100) : 10;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        error:
          "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)",
      },
      { status: 400 }
    );
  }

  if (q.length < 2) {
    return NextResponse.json({ ganim: [] });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  let { data, error } = await supabase.rpc("search_ganim", {
    p_query: q,
    p_limit: pLimit,
  });

  if (error) {
    console.error("[API ganim/search] RPC error:", error);
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: 500 }
    );
  }

  if ((data ?? []).length === 0 && q.includes(",")) {
    const namePart = q.split(",")[0]?.trim() ?? "";
    if (namePart.length >= 2) {
      const fallback = await supabase.rpc("search_ganim", {
        p_query: namePart,
        p_limit: pLimit,
      });
      if (!fallback.error) {
        return NextResponse.json({ ganim: fallback.data ?? [] });
      }
    }
  }

  return NextResponse.json({ ganim: data ?? [] });
}
