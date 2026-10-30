import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { escapeHtml, notifyAdmins, requestLinksHtml } from "@/lib/admin-notify";
import { KIDS_FIELD_LABELS, diffKidsChanges, formatKidsValue, parseKidsChanges, type KidsChanges } from "@/lib/kids-attributes";

function changesTableHtml(changes: KidsChanges, previous: KidsChanges): string {
  const cell = "padding:4px 8px;text-align:right";
  const rows = Object.entries(changes).map(([k, v]) =>
    `<tr><td style="${cell}"><strong>${escapeHtml(KIDS_FIELD_LABELS[k] ?? k)}</strong></td>` +
    `<td style="${cell};color:#888">${escapeHtml(formatKidsValue(k, previous[k]))}</td>` +
    `<td style="${cell};color:#1D7F4F">${escapeHtml(formatKidsValue(k, v))}</td></tr>`).join("");
  return `<table style="border-collapse:collapse"><tr><th style="${cell}">שדה</th><th style="${cell}">עכשיו</th><th style="${cell}">מבוקש</th></tr>${rows}</table>`;
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

  const { data: inserted, error: insertErr } = await admin.from("place_detail_requests").insert({
    place_id: placeId,
    user_id: userData.user.id,
    changes,
    previous,
  }).select("id").single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "שגיאה בשמירת הבקשה" }, { status: 500 });
  }

  await notifyAdmins({
    subject: `בקשת עדכון פרטים: ${place.name}`,
    html: `<h2>בקשה חדשה לעדכון פרטים</h2>
      <p>מישהו ביקש לעדכן פרטים ב<strong>${escapeHtml(place.name)}</strong>:</p>
      ${changesTableHtml(changes, previous)}
      ${requestLinksHtml(new URL(req.url).origin, "place-detail-requests", inserted.id)}`,
  });

  return NextResponse.json({ success: true, pending: true, changed: Object.keys(changes).length });
}
