import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { ownerManagedInfo, ownerRelatedToPlace, requireUser } from "@/lib/server/place-owners";
import { escapeHtml, notifyAdmins, requestLinksHtml } from "@/lib/admin-notify";

// GET /api/places/owner?place_id=… — public: is the place managed by a verified owner, and when an
// owner last changed it. With a Bearer token also: my latest ownership request here, and whether I
// own / asked to own another place in the same category (for the recommendation form).
export async function GET(req: Request) {
  const placeId = new URL(req.url).searchParams.get("place_id")?.trim() ?? "";
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });

  const hasToken = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
  const auth = hasToken ? await requireUser(req) : null;
  const admin = auth?.admin ?? createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const info = await ownerManagedInfo(admin, placeId);
  if (!auth?.user) return NextResponse.json({ ...info, claim: null, competitor: false });

  const { data } = await admin
    .from("place_owner_claims")
    .select("id,status,created_at,decided_at")
    .eq("user_id", auth.user.id)
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(1);
  const claim = data?.[0] ?? null;
  const competitor = !claim && (await ownerRelatedToPlace(admin, auth.user.id, placeId));
  return NextResponse.json({ ...info, claim, competitor });
}

// POST /api/places/owner — ask to be the owner of a place
// body: { place_id, full_name, role?, phone, note?, accepted_rules: true }
// No files: the admin verifies by phone (user decision 2026-11-07, privacy).
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const placeId = s(body.place_id, 64);
  const fullName = s(body.full_name, 120);
  const role = s(body.role, 120) || null;
  const phone = s(body.phone, 30);
  const note = s(body.note, 1000) || null;
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "נא למלא שם" }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 9) return NextResponse.json({ error: "נא למלא מספר טלפון תקין" }, { status: 400 });
  if (body.accepted_rules !== true) return NextResponse.json({ error: "נא לאשר את הכללים" }, { status: 400 });

  const { admin, user } = auth;
  const { data: place } = await admin.from("places").select("name,phone").eq("id", placeId).maybeSingle();
  if (!place) return NextResponse.json({ error: "מקום לא נמצא" }, { status: 404 });

  const { data: open } = await admin
    .from("place_owner_claims")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("place_id", placeId)
    .in("status", ["pending", "approved"])
    .limit(1);
  if (open?.length) {
    return NextResponse.json({ error: open[0].status === "approved" ? "את/ה כבר בעל/ת המקום" : "הבקשה כבר אצלנו" }, { status: 409 });
  }

  const { data: inserted, error } = await admin
    .from("place_owner_claims")
    .insert({ place_id: placeId, user_id: user.id, full_name: fullName, role, phone, note })
    .select("id")
    .single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });

  const listed = Array.isArray(place.phone) && place.phone.length ? place.phone.join(", ") : "אין טלפון ברישום";
  await notifyAdmins({
    subject: `בקשת בעלות: ${place.name}`,
    html: `<h2>מישהו ביקש להיות בעל/ת המקום</h2>
      <p><strong>${escapeHtml(place.name)}</strong></p>
      <p>שם: ${escapeHtml(fullName)}${role ? ` (${escapeHtml(role)})` : ""}<br/>
      טלפון לחזרה: ${escapeHtml(phone)}<br/>
      הטלפון שברישום: ${escapeHtml(listed)}<br/>
      חשבון: ${escapeHtml(user.email ?? "-")}</p>
      ${note ? `<p>הערה: ${escapeHtml(note)}</p>` : ""}
      ${requestLinksHtml(new URL(req.url).origin, "owner-claims", inserted.id)}`,
  });

  return NextResponse.json({ success: true });
}
