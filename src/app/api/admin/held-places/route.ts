import { requireAdmin } from "@/lib/server/require-admin";
import { privateJson } from "@/lib/server/no-store";

// Answers depend on who is signed in: never serve a cached copy.
export const dynamic = "force-dynamic";

// GET /api/admin/held-places — NEW places the automatic check saved hidden (attributes.place_hold), waiting for the admin
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await auth.admin
    .from("places")
    .select("id,name,place_category,address,description,phone,website,hours,created_at,attributes")
    .eq("is_hidden", true)
    .eq("source", "community")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return privateJson({ error: error.message }, { status: 500 });

  const items = ((data ?? []) as any[])
    .filter((r) => r.attributes?.place_hold && !r.attributes.place_hold.rejected)
    .map((r) => ({
      id: r.id, name: r.name, place_category: r.place_category, address: r.address, description: r.description,
      phone: r.phone, website: r.website, hours: r.hours, created_at: r.created_at,
      reasons: (r.attributes.place_hold.reasons ?? []) as string[],
    }));
  return privateJson({ items });
}

// POST /api/admin/held-places  body: { id, action: "approve" | "reject" }
// approve: the place is shown on the map. reject: it stays hidden (nothing is deleted) and leaves this list.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return privateJson({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action;
  if (!id || (action !== "approve" && action !== "reject")) {
    return privateJson({ error: "Missing id or action" }, { status: 400 });
  }

  const { data: place } = await auth.admin.from("places").select("id,attributes,is_hidden").eq("id", id).maybeSingle();
  const attrs = (place?.attributes ?? {}) as Record<string, any>;
  if (!place || !place.is_hidden || !attrs.place_hold || attrs.place_hold.rejected) {
    return privateJson({ error: "המקום כבר לא ממתין" }, { status: 409 });
  }

  const { place_hold, ...rest } = attrs;
  const update = action === "approve"
    ? { is_hidden: false, attributes: rest, updated_at: new Date().toISOString() }
    : { attributes: { ...rest, place_hold: { ...place_hold, rejected: true } }, updated_at: new Date().toISOString() };
  const { error } = await auth.admin.from("places").update(update).eq("id", id);
  if (error) return privateJson({ error: error.message }, { status: 500 });
  return privateJson({ success: true });
}
