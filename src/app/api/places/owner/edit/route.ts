import { NextResponse } from "next/server";
import { isApprovedOwner, requestPlaceRemoval, requireUser } from "@/lib/server/place-owners";
import { BASIC_SELECT, applyBasicChanges, diffBasicChanges, parseBasicChanges } from "@/lib/place-basic-details";

// POST /api/places/owner/edit — approved owners only.
// body: { place_id, ...basic fields }  → applied at once, logged as auto_applied (admin can undo)
// body: { place_id, remove_listing: true, reason, details? } → hidden at once if no recommendations, else the admin decides
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  if (!(await isApprovedOwner(admin, user.id, placeId))) {
    return NextResponse.json({ error: "רק בעלי המקום יכולים לעשות את זה" }, { status: 403 });
  }

  const { data: place } = await admin.from("places").select(`id, ${BASIC_SELECT}`).eq("id", placeId).maybeSingle();
  if (!place) return NextResponse.json({ error: "מקום לא נמצא" }, { status: 404 });
  const origin = new URL(req.url).origin;

  if (body.remove_listing === true) {
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);
    const result = await requestPlaceRemoval(admin, {
      placeId, userId: user.id, reason: str(body.reason, 40) ?? "", details: str(body.details, 1000), origin,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ success: true, hidden: result.hidden });
  }

  const { changes, previous } = diffBasicChanges(parseBasicChanges(body), place as any);
  if (Object.keys(changes).length === 0) return NextResponse.json({ error: "לא שיניתם אף פרט" }, { status: 400 });

  const update = applyBasicChanges(place as any, changes);
  const { error: applyErr } = await admin.from("places").update(update).eq("id", placeId);
  if (applyErr) return NextResponse.json({ error: applyErr.message }, { status: 500 });

  const now = new Date().toISOString();
  // In the admin queue with an undo; reported in the daily summary, not by email each (2026-11-07)
  await admin.from("place_detail_requests").insert({
    place_id: placeId, user_id: user.id, changes, previous,
    status: "approved", auto_applied: true, reviewed_at: now,
  });

  const { updated_at: _u, ...placePatch } = update;
  return NextResponse.json({ success: true, applied: true, place: placePatch });
}
