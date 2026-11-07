import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requestPlaceRemoval, requireUser } from "@/lib/server/place-owners";
import { escapeHtml, notifyAdmins } from "@/lib/admin-notify";
import { serverEnv } from "@/lib/env/server";

// Answers depend on who is signed in: never serve a cached copy (a stale one showed "no request").
export const dynamic = "force-dynamic";

// Account deletion like Instagram/Facebook (decisions 2026-11-07): the person asks in the app,
// recommendations they chose to delete go at once, and the account itself is deleted by the daily
// job after 30 days. Signing in during those 30 days shows the request with a cancel button.

// GET /api/account/deletion — my open request (or null), and places I own (for the form)
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { admin, user } = auth;
  const [{ data: open }, { data: owned }] = await Promise.all([
    admin.from("account_deletion_requests").select("id,keep_reviews,requested_at,scheduled_for")
      .eq("user_id", user.id).is("cancelled_at", null).is("completed_at", null).limit(1),
    admin.from("place_owner_claims").select("place_id,places(name)").eq("user_id", user.id).eq("status", "approved"),
  ]);
  return NextResponse.json({
    request: open?.[0] ?? null,
    owned_places: ((owned ?? []) as any[]).map((r) => ({ place_id: r.place_id, name: r.places?.name ?? "" })),
  });
}

// POST /api/account/deletion
// body: { confirm: "מחיקה", keep_reviews: boolean, places?: [{ place_id, remove: boolean, reason?, details? }] }
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
  if (typeof body.confirm !== "string" || body.confirm.trim() !== "מחיקה") {
    return NextResponse.json({ error: "כדי לאשר, כתבו מחיקה" }, { status: 400 });
  }
  if (typeof body.keep_reviews !== "boolean") {
    return NextResponse.json({ error: "נא לבחור מה לעשות עם ההמלצות" }, { status: 400 });
  }
  const keepReviews = body.keep_reviews;

  const { data: open } = await admin.from("account_deletion_requests").select("id")
    .eq("user_id", user.id).is("cancelled_at", null).is("completed_at", null).limit(1);
  if (open?.length) return NextResponse.json({ error: "החשבון כבר מתוזמן למחיקה" }, { status: 409 });

  // Owners first: a removal request for each place they chose to remove (a reason is required)
  const origin = new URL(req.url).origin;
  const places = Array.isArray(body.places) ? (body.places as Record<string, unknown>[]) : [];
  const { data: owned } = await admin.from("place_owner_claims").select("place_id").eq("user_id", user.id).eq("status", "approved");
  const ownedIds = new Set(((owned ?? []) as any[]).map((r) => r.place_id));
  for (const p of places) {
    if (p.remove !== true || typeof p.place_id !== "string" || !ownedIds.has(p.place_id)) continue;
    const details = typeof p.details === "string" ? p.details.trim().slice(0, 1000) || null : null;
    const result = await requestPlaceRemoval(admin, {
      placeId: p.place_id, userId: user.id, reason: typeof p.reason === "string" ? p.reason : "", details, origin,
    });
    // "already asked" isn't a reason to stop the account deletion
    if ("error" in result && result.status !== 409) return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { data: inserted, error } = await admin.from("account_deletion_requests")
    .insert({ user_id: user.id, keep_reviews: keepReviews })
    .select("scheduled_for").single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "שגיאה בשמירה" }, { status: 500 });

  // Recommendations they chose to delete go now; the place rating trigger recalculates
  if (!keepReviews) await admin.from("place_reviews").delete().eq("user_id", user.id);

  const until = new Date(inserted.scheduled_for).toLocaleDateString("he-IL");
  const { RESEND_API_KEY: key, RESEND_FROM_EMAIL: from } = serverEnv;
  if (key && from && user.email) {
    try {
      await new Resend(key).emails.send({
        from,
        to: user.email,
        subject: "החשבון שלך ב-GiveMyTime יימחק",
        html: `<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
          <p>קיבלנו את הבקשה למחוק את החשבון שלך.</p>
          <p>${keepReviews ? "ההמלצות שכתבת יישארו באתר בעילום שם." : "ההמלצות שכתבת נמחקו."}</p>
          <p>החשבון יימחק ב-<strong>${escapeHtml(until)}</strong>. עד אז אפשר לבטל: פשוט להתחבר לאתר וללחוץ על &quot;ביטול המחיקה&quot;.</p>
          <p style="color:#666;font-size:13px">אם לא ביקשת למחוק את החשבון, התחבר/י לאתר ובטל/י את המחיקה.</p>
        </div>`,
      });
    } catch (e) {
      console.error("[account-deletion] confirmation email failed:", e);
    }
  }
  await notifyAdmins({
    subject: "בקשה למחיקת חשבון",
    html: `<p>משתמש/ת ביקש/ה למחוק את החשבון. החשבון יימחק אוטומטית ב-${escapeHtml(until)}.</p>
      <p>המלצות: ${keepReviews ? "נשארות בעילום שם" : "נמחקו"}.</p>`,
  });

  return NextResponse.json({ success: true, scheduled_for: inserted.scheduled_for });
}

// DELETE /api/account/deletion — cancel (only during the 30 days)
export async function DELETE(req: Request) {
  const auth = await requireUser(req);
  if (auth.error) return auth.error;
  const { data, error } = await auth.admin.from("account_deletion_requests")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("user_id", auth.user.id).is("cancelled_at", null).is("completed_at", null)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "אין בקשת מחיקה פתוחה" }, { status: 404 });
  return NextResponse.json({ success: true });
}
