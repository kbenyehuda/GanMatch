import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/require-admin";

// GET /api/admin/consents — private people and their consent to be listed (place_consents)
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.admin
    .from("place_consents")
    .select("place_id,contact,status,asked_at,answered_at,proof,updated_at,places(name,phone,is_hidden,attributes,rec_count)")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hidden places' rec_count still counts their reviews (the stats trigger skips only hidden reviews)
  return NextResponse.json({ items: data ?? [] });
}

// POST /api/admin/consents
// body: { place_id, action: "save" | "asked" | "given" | "refused", contact?, proof? }
// "given" shows the place on the site again; "refused" (or any other status) keeps or puts it back hidden.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { place_id?: unknown; action?: unknown; contact?: unknown; proof?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  const action = body.action;
  if (!placeId || (action !== "save" && action !== "asked" && action !== "given" && action !== "refused")) {
    return NextResponse.json({ error: "Missing place_id or action" }, { status: 400 });
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 500) || null : undefined);

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };
  const contact = text(body.contact);
  const proof = text(body.proof);
  if (contact !== undefined) update.contact = contact;
  if (proof !== undefined) update.proof = proof;
  if (action === "asked") Object.assign(update, { status: "asked", asked_at: now });
  if (action === "given" || action === "refused") Object.assign(update, { status: action, answered_at: now });

  const { error } = await auth.admin.from("place_consents").update(update).eq("place_id", placeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action !== "save") {
    const { error: placeErr } = await auth.admin.from("places")
      .update({ is_hidden: action !== "given", updated_at: now }).eq("id", placeId);
    if (placeErr) return NextResponse.json({ error: placeErr.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
