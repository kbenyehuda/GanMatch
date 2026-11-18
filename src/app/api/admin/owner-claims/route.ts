import { requireAdmin } from "@/lib/server/require-admin";
import { privateJson } from "@/lib/server/no-store";

// Answers depend on who is signed in: never serve a cached copy (a stale one showed "no request").
export const dynamic = "force-dynamic";

// GET /api/admin/owner-claims?status=pending|approved|declined|revoked|all — ownership requests
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const { admin } = auth;

  const statusParam = new URL(req.url).searchParams.get("status") ?? "pending";
  let query = admin
    .from("place_owner_claims")
    .select("id,place_id,user_id,full_name,role,phone,note,status,verification_note,created_at,decided_at,places(name,address,place_category,phone)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (["pending", "approved", "declined", "revoked"].includes(statusParam)) query = query.eq("status", statusParam);

  const { data, error } = await query;
  if (error) return privateJson({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as any[];

  const emailByUser: Record<string, string | null> = {};
  await Promise.all(Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))).map(async (id: string) => {
    try { emailByUser[id] = (await admin.auth.admin.getUserById(id)).data.user?.email ?? null; } catch { emailByUser[id] = null; }
  }));

  // Other claims by the same person, so several places / several requests are visible together
  const otherByUser: Record<string, { id: string; place: string; status: string }[]> = {};
  const userIds = Object.keys(emailByUser);
  if (userIds.length) {
    const { data: all } = await admin.from("place_owner_claims").select("id,user_id,status,places(name)").in("user_id", userIds);
    for (const c of (all ?? []) as any[]) (otherByUser[c.user_id] ??= []).push({ id: c.id, place: c.places?.name ?? "", status: c.status });
  }

  // Did this person ADD the place, or already WRITE recommendations on it? (admin-only context for the decision)
  const placeIds = Array.from(new Set(rows.map((r) => r.place_id).filter(Boolean))) as string[];
  const addedBy: Record<string, string | null> = {};
  const reviewsByPair: Record<string, { n: number; stars: number[] }> = {};
  if (userIds.length && placeIds.length) {
    const [{ data: ps }, { data: rs }] = await Promise.all([
      admin.from("places").select("id,suggested_by").in("id", placeIds),
      admin.from("place_reviews").select("user_id,place_id,rating").in("user_id", userIds).in("place_id", placeIds),
    ]);
    for (const p of (ps ?? []) as any[]) addedBy[p.id] = p.suggested_by ?? null;
    for (const r of (rs ?? []) as any[]) {
      const entry = (reviewsByPair[`${r.user_id}:${r.place_id}`] ??= { n: 0, stars: [] });
      entry.n++;
      entry.stars.push(Number(r.rating));
    }
  }

  const items = rows.map((r) => ({
    ...r,
    user_email: r.user_id ? emailByUser[r.user_id] ?? null : null,
    other_claims: r.user_id ? (otherByUser[r.user_id] ?? []).filter((c) => c.id !== r.id) : [],
    added_this_place: !!r.user_id && addedBy[r.place_id] === r.user_id,
    reviews_here: (r.user_id && reviewsByPair[`${r.user_id}:${r.place_id}`]) || { n: 0, stars: [] },
  }));
  return privateJson({ items });
}

// POST /api/admin/owner-claims  body: { id, action: "approve" | "decline" | "revoke", verification_note? }
// Approve needs a note on how it was verified (e.g. "התקשרתי לטלפון שברישום"); never a document.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const { admin } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action;
  const note = typeof body.verification_note === "string" ? body.verification_note.trim().slice(0, 500) : "";
  if (!id || (action !== "approve" && action !== "decline" && action !== "revoke")) {
    return privateJson({ error: "Missing id or action" }, { status: 400 });
  }
  if (action === "approve" && !note) {
    return privateJson({ error: "כתבי איך אימתת (למשל: התקשרתי לטלפון שברישום)" }, { status: 400 });
  }

  const { data: claim } = await admin.from("place_owner_claims").select("id,status,user_id,place_id").eq("id", id).maybeSingle();
  if (!claim) return privateJson({ error: "Not found" }, { status: 404 });
  const allowedFrom: Record<string, string[]> = { approve: ["pending"], decline: ["pending"], revoke: ["approved"] };
  if (!allowedFrom[action as string].includes(claim.status)) {
    return privateJson({ error: `Already ${claim.status}` }, { status: 409 });
  }

  const status = action === "approve" ? "approved" : action === "decline" ? "declined" : "revoked";
  const { error } = await admin.from("place_owner_claims").update({
    status,
    decided_at: new Date().toISOString(),
    ...(note ? { verification_note: note } : {}),
  }).eq("id", id);
  if (error) return privateJson({ error: error.message }, { status: 500 });

  // Decision 2026-11-18: when someone becomes the approved owner of a place they already recommended,
  // that recommendation is hidden until the admin has looked at it (it appears in /admin/held-reviews).
  let hidden = 0;
  if (action === "approve" && claim.user_id && claim.place_id) {
    const { data: held } = await admin.from("place_reviews")
      .update({ is_hidden: true, check_status: "held", hold_reasons: ["owner_related"], approved_at: null })
      .eq("user_id", claim.user_id).eq("place_id", claim.place_id).eq("is_hidden", false)
      .select("id");
    hidden = held?.length ?? 0;
  }
  return privateJson({ success: true, hidden_reviews: hidden });
}
