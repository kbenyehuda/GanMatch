import { requireAdmin } from "@/lib/server/require-admin";
import { ownerContextFor } from "@/lib/server/place-owners";
import { privateJson } from "@/lib/server/no-store";

// Answers depend on who is signed in: never serve a cached copy (a stale one showed "no request").
export const dynamic = "force-dynamic";

// GET /api/admin/held-reviews — recommendations saved hidden (flagged by the check, or 1–2 stars)
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.admin
    .from("place_reviews")
    .select("id,place_id,user_id,rating,text,hold_reasons,reviewer_public_name,created_at,places(name,address,place_category)")
    .eq("is_hidden", true)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return privateJson({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as any[];
  const ownerCtx = await ownerContextFor(auth.admin, rows.map((r) => ({ user_id: r.user_id ?? null, place_id: String(r.place_id) })));
  // user_id is only used for the labels; it isn't sent to the page
  const items = rows.map(({ user_id, ...r }) => ({ ...r, owner: user_id ? ownerCtx[`${user_id}:${r.place_id}`] ?? null : null }));
  return privateJson({ items });
}

// POST /api/admin/held-reviews  body: { id, action: "approve" | "delete" }
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: { id?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = body.action;
  if (!id || (action !== "approve" && action !== "delete")) {
    return privateJson({ error: "Missing id or action" }, { status: 400 });
  }

  // The trigger on place_reviews recalculates the place's rating and count either way
  const { error } = action === "approve"
    ? await auth.admin.from("place_reviews").update({ is_hidden: false, check_status: "approved", hold_reasons: null, approved_at: new Date().toISOString() }).eq("id", id).eq("is_hidden", true)
    : await auth.admin.from("place_reviews").delete().eq("id", id).eq("is_hidden", true);
  if (error) return privateJson({ error: error.message }, { status: 500 });
  return privateJson({ success: true });
}
