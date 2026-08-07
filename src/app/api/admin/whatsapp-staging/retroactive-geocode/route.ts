import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ensureAdminFullAccessForUser } from "@/lib/entitlements/service";
import { geocodeHint, extractAddressFromText } from "@/lib/whatsapp-geocode";

// POST /api/admin/whatsapp-staging/retroactive-geocode
//
// Processes approved WhatsApp-imported places that were created without
// explicit lat/lon on the staging row (i.e., location came from an
// unreliable geocode fallback or Givatayim default).
//
// For each such place:
//   1. Re-geocode using address_hint if present.
//   2. Otherwise call LLM to extract any address from the message text.
//   3. If an address is found, geocode it and update places.location.
//   4. If nothing found, set places.location = NULL.
//
// Processes up to `limit` rows per call (default 20) so the client can
// poll until `remaining` reaches 0.

export async function POST(req: Request) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: svc } = serverEnv;
  if (!url || !anon || !svc) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: ud, error: ue } = await userClient.auth.getUser();
  const email = String(ud?.user?.email ?? "").trim().toLowerCase();
  if (ue || !ud?.user || !email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!serverEnv.ADMIN_EMAILS.has(email)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  await ensureAdminFullAccessForUser({ userId: ud.user.id, email });

  let body: any = {};
  try { body = await req.json(); } catch { /* no body is fine */ }
  const limit: number = Math.min(typeof body?.limit === "number" ? body.limit : 20, 50);

  const { OPENAI_API_KEY: openaiKey } = serverEnv;
  if (!openaiKey) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });

  const admin = createClient(url, svc, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  // Find approved staging rows where the place has no explicit lat/lon in staging
  // (meaning the current place location came from geocoding or the old Givatayim fallback).
  // Rows already processed by this endpoint have lat=-1 (geocoded with no result) or
  // real coords (geocoded successfully) — both are excluded by this filter.
  const unprocessedFilter = "lat.is.null,lat.eq.0";
  const { data: rows, error: rowErr } = await admin
    .from("whatsapp_import_staging")
    .select("id, place_name, category, address_hint, recommendation_text, source_messages, created_place_id, lat, lon")
    .eq("status", "approved")
    .not("created_place_id", "is", null)
    .or(unprocessedFilter)
    .limit(limit);

  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });

  // Count how many are still pending (for progress reporting)
  const { count: remaining } = await admin
    .from("whatsapp_import_staging")
    .select("id", { count: "exact", head: true })
    .eq("status", "approved")
    .not("created_place_id", "is", null)
    .or(unprocessedFilter);

  const results: { id: string; place_name: string; action: "geocoded" | "nulled" | "skipped" | "error"; address?: string; error?: string }[] = [];

  for (const row of rows ?? []) {
    const placeId = row.created_place_id as string;

    try {
      // 1. Try existing address_hint first
      let hint: string | null = row.address_hint ?? null;

      // 2. If no hint, ask LLM to extract one from the recommendation text.
      // extractAddressFromText throws on a real API failure (e.g. rate limit)
      // instead of returning null — a thrown error must NOT be treated as
      // "no address found" (that bug previously nulled out real addresses
      // during a rate-limited burst — see project_ui_polish_backlog memory).
      if (!hint) {
        const textToSearch = [
          ...(Array.isArray(row.source_messages) ? row.source_messages : []),
          row.recommendation_text ?? "",
        ].join("\n").trim();

        if (textToSearch) {
          hint = await extractAddressFromText(textToSearch, row.place_name as string, openaiKey);
        }
      }

      if (hint) {
        // 3. Geocode the hint
        const coords = await geocodeHint(row.place_name as string, hint);
        if (coords) {
          await admin.rpc("update_place_location", { p_id: placeId, p_lat: coords.lat, p_lon: coords.lon });
          // Mark staging row with real coords so it won't be re-fetched next run
          await admin.from("whatsapp_import_staging").update({ address_hint: hint, lat: coords.lat, lon: coords.lon }).eq("id", row.id);
          results.push({ id: row.id as string, place_name: row.place_name as string, action: "geocoded", address: hint });
          continue;
        }
      }

      // 4. Genuinely nothing found (LLM confirmed no address, or the hint
      // didn't geocode to anything) — null out the location. Set staging
      // lat/lon to -1 (sentinel: processed, no address) so this row is
      // excluded from future runs (filter only matches null and 0).
      await admin.from("places").update({ location: null, updated_at: new Date().toISOString() }).eq("id", placeId);
      await admin.from("whatsapp_import_staging").update({ lat: -1, lon: -1 }).eq("id", row.id);
      results.push({ id: row.id as string, place_name: row.place_name as string, action: "nulled" });
    } catch (e: any) {
      // A real failure (network/API error) — leave the staging row untouched
      // (lat/lon stay null) so it's picked up and retried on the next run,
      // instead of being permanently marked as "no address found".
      results.push({ id: row.id as string, place_name: row.place_name as string, action: "error", error: e?.message ?? String(e) });
    }

    // Small delay between rows so a batch of LLM calls doesn't burst past
    // OpenAI's rate limit (the failure mode that caused this fix).
    await new Promise((r) => setTimeout(r, 350));
  }

  return NextResponse.json({
    processed: results.length,
    remaining: Math.max(0, (remaining ?? 0) - results.length),
    done: (rows?.length ?? 0) < limit,
    results,
  });
}
