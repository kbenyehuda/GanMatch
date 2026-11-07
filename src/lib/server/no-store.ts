import "server-only";
import { NextResponse } from "next/server";

/**
 * JSON for answers that depend on who is signed in. Vercel kept a per-URL copy of
 * /api/places/owner and served it regardless of the Authorization header (found 2026-11-07),
 * so these say explicitly: never store, and the answer varies by Authorization.
 */
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
