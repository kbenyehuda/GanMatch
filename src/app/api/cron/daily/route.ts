import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { escapeHtml, notifyAdmins } from "@/lib/admin-notify";
import { KIDS_FIELD_LABELS } from "@/lib/kids-attributes";
import { BASIC_FIELD_LABELS } from "@/lib/place-basic-details";

// Answers depend on who is signed in: never serve a cached copy (a stale one showed "no request").
export const dynamic = "force-dynamic";

// GET /api/cron/daily — run once a day by Vercel Cron (vercel.json). Vercel sends
// "Authorization: Bearer $CRON_SECRET"; anything else is refused.
//  1. Deletes accounts whose 30-day grace period ended (decision 2026-11-07).
//  2. Emails the admin one "what's new" summary of the last day: new recommendations, new places,
//     owner claims and owner changes. Sent every day, even with zero, so the KPI is always visible.
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const deleted = await deleteDueAccounts(admin);
  const summarized = await dailyDigest(admin, new URL(req.url).origin);
  return NextResponse.json({ deleted, summarized });
}

async function deleteDueAccounts(admin: SupabaseClient): Promise<{ done: number; failed: number }> {
  const { data: due } = await admin.from("account_deletion_requests")
    .select("id,user_id,keep_reviews")
    .is("cancelled_at", null).is("completed_at", null)
    .lte("scheduled_for", new Date().toISOString())
    .limit(20);
  let done = 0, failed = 0;
  for (const r of (due ?? []) as { id: string; user_id: string | null; keep_reviews: boolean }[]) {
    try {
      if (r.user_id) await deleteAccount(admin, r.user_id, r.keep_reviews);
      await admin.from("account_deletion_requests").update({ completed_at: new Date().toISOString() }).eq("id", r.id);
      done++;
    } catch (e) {
      console.error("[cron/daily] account deletion failed:", r.id, e);
      failed++;
    }
  }
  return { done, failed };
}

async function deleteAccount(admin: SupabaseClient, userId: string, keepReviews: boolean): Promise<void> {
  const now = new Date().toISOString();
  // Ownership ends with the account
  await admin.from("place_owner_claims").update({ status: "revoked", decided_at: now })
    .eq("user_id", userId).in("status", ["approved", "pending"]);

  if (keepReviews) {
    // Kept recommendations move to a fresh account nobody can sign in to, shown as "אנונימי",
    // so deleting the real account (which cascades) doesn't take them along.
    const { count } = await admin.from("place_reviews").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) > 0) {
      const created = await admin.auth.admin.createUser({
        email: `deleted-${crypto.randomUUID()}@users.givemytimeapp.com`,
        password: crypto.randomBytes(32).toString("base64url"),
        email_confirm: true,
      });
      const anonId = created.data.user?.id;
      if (!anonId) throw new Error(`anonymous holder not created: ${created.error?.message ?? "unknown"}`);
      const { error } = await admin.from("place_reviews")
        .update({ user_id: anonId, is_anonymous: true, reviewer_public_name: null, allow_contact: false })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    }
  } else {
    await admin.from("place_reviews").delete().eq("user_id", userId);
  }

  // Edit / pin history stays without the person (ON DELETE SET NULL); the rest cascades
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

/** One daily "what's new" email: everything people added to the site in the last 24 hours. */
async function dailyDigest(admin: SupabaseClient, origin: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: reviews }, { data: newPlaces }, { data: claims }, { data: details }, { data: moves }] = await Promise.all([
    admin.from("place_reviews").select("id,rating,text,is_hidden,created_at,places(name)")
      .gte("created_at", since).order("created_at"),
    admin.from("places").select("id,name,place_category,is_hidden,created_at")
      .eq("source", "community").gte("created_at", since).order("created_at"),
    admin.from("place_owner_claims").select("id,status,created_at,places(name)")
      .gte("created_at", since).order("created_at"),
    admin.from("place_detail_requests").select("id,changes,reviewed_at,reverted_at,places(name)")
      .eq("auto_applied", true).gte("reviewed_at", since).order("reviewed_at"),
    admin.from("place_location_requests").select("id,requested_address,reviewed_at,reverted_at,places(name)")
      .eq("auto_applied", true).gte("reviewed_at", since).order("reviewed_at"),
  ]);

  const label = (k: string) => KIDS_FIELD_LABELS[k] ?? BASIC_FIELD_LABELS[k] ?? k;
  const reviewRows = (reviews ?? []) as any[];
  const placeRows = (newPlaces ?? []) as any[];
  const claimRows = (claims ?? []) as any[];
  const changeRows = [
    ...((details ?? []) as any[]).map((d) => {
      const what = Object.keys(d.changes ?? {}).map(label).join(", ");
      return { place: d.places?.name ?? "", what, undone: !!d.reverted_at };
    }),
    ...((moves ?? []) as any[]).map((m) => ({ place: m.places?.name ?? "", what: `הזזת סיכה${m.requested_address ? `: ${m.requested_address}` : ""}`, undone: !!m.reverted_at })),
  ];
  const total = reviewRows.length + placeRows.length + claimRows.length + changeRows.length;

  const section = (title: string, items: string[]) =>
    items.length ? `<h3>${title} (${items.length})</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";

  const reviewItems = reviewRows.map((r) => {
    const snippet = String(r.text ?? "").trim().slice(0, 80);
    return `<strong>${escapeHtml(r.places?.name ?? "")}</strong> · ${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}`
      + `${snippet ? ` · ${escapeHtml(snippet)}${String(r.text).trim().length > 80 ? "…" : ""}` : ""}`
      + `${r.is_hidden ? " (ממתינה לאישור)" : ""}`;
  });
  // A private person (babysitter) is saved hidden until she agrees; her name stays out of the email
  const placeItems = placeRows.map((p) => (p.is_hidden ? "אדם פרטי (מוסתר עד הסכמה)" : `<strong>${escapeHtml(p.name ?? "")}</strong>`));
  const claimItems = claimRows.map((c) => `<strong>${escapeHtml(c.places?.name ?? "")}</strong> · ${escapeHtml(String(c.status ?? ""))}`);
  const changeItems = changeRows.map((r) => `<strong>${escapeHtml(r.place)}</strong>: ${escapeHtml(r.what)}${r.undone ? " (בוטל)" : ""}`);

  await notifyAdmins({
    subject: total
      ? `מה חדש באתר: ${total} תרומות ביממה האחרונה`
      : "מה חדש באתר: אין תרומות חדשות ביממה האחרונה",
    html: `<h2>מה חדש באתר ביממה האחרונה</h2>
      <p>סה״כ <strong>${total}</strong> תרומות: ${reviewRows.length} המלצות, ${placeRows.length} מקומות חדשים, ${claimRows.length} בקשות בעלות, ${changeRows.length} שינויים של בעלי מקומות.</p>
      ${section("המלצות חדשות", reviewItems)}
      ${section("מקומות חדשים", placeItems)}
      ${section("בקשות בעלות", claimItems)}
      ${section("שינויים של בעלי מקומות (כבר באתר, אפשר לבטל)", changeItems)}
      <p><a href="${origin}/admin/analytics">לניתוח הנתונים</a> · <a href="${origin}/admin/place-detail-requests">עדכוני פרטים</a> · <a href="${origin}/admin/place-location-requests">הזזות סיכה</a></p>`,
  });
  return total;
}
