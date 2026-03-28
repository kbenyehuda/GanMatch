import { createClient } from "@supabase/supabase-js";
import { cache } from "react";
import { mapGanimRpcRowToGan } from "@/lib/ganim-api";
import { publicEnv } from "@/lib/env/public";
import type { Gan } from "@/types/ganim";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Load one gan (review aggregates + lat/lon) for `/gan/[id]` and metadata.
 *
 * **Not found:** `get_gan_by_id` returns zero rows; PostgREST returns `[]`. We map that to
 * `null`. No Postgres exception for a missing id — the Next.js server component does not crash.
 *
 * **Why RPC instead of `.from('ganim_v2').select()`:** The public row shape matches the map RPCs:
 * joined `confirmed_reviews` aggregates and `ST_Y`/`ST_X` from `location`. A plain table select
 * would omit those or need a duplicate view.
 *
 * **Deduping:** Wrapped in React `cache()` so `generateMetadata` and the page’s `fetchGanById`
 * in the same RSC pass share one Supabase round-trip (per `id`).
 */
async function fetchGanByIdUncached(id: string): Promise<Gan | null> {
  if (!UUID_RE.test(id)) return null;
  const url = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key);
  const { data, error } = await supabase.rpc("get_gan_by_id", { p_id: id });
  if (error) {
    console.error("[fetchGanById] RPC error:", error.message);
    return null;
  }
  if (!data || !Array.isArray(data) || data.length === 0) return null;
  return mapGanimRpcRowToGan(data[0] as Record<string, unknown>);
}

export const fetchGanById = cache(fetchGanByIdUncached);
