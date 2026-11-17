import "server-only";
import { NextResponse } from "next/server";

/**
 * JSON for answers that depend on who is signed in. Vercel kept a per-URL copy of
 * /api/places/owner and served it regardless of the Authorization header (found 2026-11-07),
 * so these say explicitly: never store, and the answer varies by Authorization.
 */
/**
 * fetch for server-side Supabase clients that read live data (admin lists, decisions).
 * Without it, Next kept answering the same database read from its own copy: new rows never
 * showed in the admin lists and never reached the database log (found 2026-11-17).
 */
export const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function privateJson(body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, {
    status: init?.status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
      Vary: "Authorization",
    },
  });
}
