import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { Resend } from "resend";
import { KIDS_FIELD_LABELS, diffKidsChanges, formatKidsValue, parseKidsChanges, type KidsChanges } from "@/lib/kids-attributes";

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Emails the admins that a "ערכו פרטים" request is waiting. Never throws: the request is already saved. */
async function notifyAdmins(args: { placeName: string; changes: KidsChanges; previous: KidsChanges; reviewUrl: string }) {
  const { RESEND_API_KEY: key, RESEND_FROM_EMAIL: from, ADMIN_EMAILS } = serverEnv;
  const to = Array.from(ADMIN_EMAILS);
  if (!key || !from || to.length === 0) return;
  const rows = Object.entries(args.changes).map(([k, v]) =>
    `<tr><td style="padding:4px 8px"><strong>${escapeHtml(KIDS_FIELD_LABELS[k] ?? k)}</strong></td>` +
    `<td style="padding:4px 8px;color:#888">${escapeHtml(formatKidsValue(k, args.previous[k]))}</td>` +
    `<td style="padding:4px 8px;color:#1D7F4F">${escapeHtml(formatKidsValue(k, v))}</td></tr>`).join("");
  try {
    const { error } = await new Resend(key).emails.send({
      from,
      to,
      subject: `בקשת עדכון פרטים: ${args.placeName}`,
      html: `<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>בקשה חדשה לעדכון פרטים</h2>
        <p>מישהו ביקש לעדכן פרטים ב<strong>${escapeHtml(args.placeName)}</strong>:</p>
        <table style="border-collapse:collapse"><tr><th style="text-align:right;padding:4px 8px">שדה</th><th style="text-align:right;padding:4px 8px">עכשיו</th><th style="text-align:right;padding:4px 8px">מבוקש</th></tr>${rows}</table>
        <p><a href="${args.reviewUrl}">לאישור או דחייה</a></p>
      </div>`,
    });
    if (error) console.error("[kids-attributes] admin email failed:", error);
  } catch (e) {
    console.error("[kids-attributes] admin email threw:", e);
  }
}

// POST /api/places/kids-attributes
// body: { place_id, ...any KidsAttributes fields, hours?, kosher? }
// Saves the fields that differ from the place as a pending request (place_detail_requests);
// the place changes only when an admin approves it (user decision 2026-10-30).
export async function POST(req: NextRequest) {
  const url = serverEnv.NEXT_PUBLIC_SUPABASE_URL;
  const anon = serverEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = serverEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceKey) {
    return NextResponse.json({ error: "Supabase config missing" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: place, error: fetchErr } = await admin
    .from("places")
    .select("name, place_category, attributes, hours, kosher")
    .eq("id", placeId)
    .single();
  if (fetchErr || !place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }
  if (place.place_category !== "kids") {
    return NextResponse.json({ error: "Only kids places support these fields" }, { status: 400 });
  }

  const { changes, previous } = diffKidsChanges(parseKidsChanges(body), place);
  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: "לא שיניתם אף פרט" }, { status: 400 });
  }

  const { error: insertErr } = await admin.from("place_detail_requests").insert({
    place_id: placeId,
    user_id: userData.user.id,
    changes,
    previous,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await notifyAdmins({
    placeName: place.name,
    changes,
    previous,
    reviewUrl: `${new URL(req.url).origin}/admin/place-detail-requests`,
  });

  return NextResponse.json({ success: true, pending: true, changed: Object.keys(changes).length });
}
