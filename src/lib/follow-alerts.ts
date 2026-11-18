import "server-only";
import crypto from "node:crypto";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";
import { escapeHtml } from "@/lib/admin-notify";
import { KIDS_FIELD_LABELS } from "@/lib/kids-attributes";
import { BASIC_FIELD_LABELS } from "@/lib/place-basic-details";

// Daily update emails (decisions 2026-11-18): people who saved a place AND switched on email updates
// hear about meaningful changes to it; approved owners hear about new recommendations and edits by
// others on their place. One email per person per day, only when something changed.
// Pin moves are not "meaningful" and are left out.

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || "";
export const signUnsubscribe = (userId: string) =>
  crypto.createHmac("sha256", secret()).update(`unsub:${userId}`).digest("hex").slice(0, 32);
export const checkUnsubscribe = (userId: string, token: string) => {
  const a = Buffer.from(signUnsubscribe(userId)), b = Buffer.from(token);
  return secret() !== "" && a.length === b.length && crypto.timingSafeEqual(a, b);
};

type Item = { placeId: string; placeName: string; text: string };

const label = (k: string) => KIDS_FIELD_LABELS[k] ?? BASIC_FIELD_LABELS[k] ?? k;

/** preview: build the email from the last `hours` of real changes on ANY place and send it only to this one person. */
export async function sendFollowAlerts(
  admin: SupabaseClient, origin: string, preview?: { userId: string; hours: number },
): Promise<{ sent: number; failed: number }> {
  const from = serverEnv.RESEND_FROM_UPDATES_EMAIL;
  const key = serverEnv.RESEND_API_KEY;
  if (!key || !from || !secret()) {
    console.error("[follow-alerts] not sent: RESEND_API_KEY, RESEND_FROM_UPDATES_EMAIL or CRON_SECRET missing");
    return { sent: 0, failed: 0 };
  }
  const since = new Date(Date.now() - (preview?.hours ?? 24) * 60 * 60 * 1000).toISOString();

  const [{ data: reviews }, { data: edits }] = await Promise.all([
    admin.from("place_reviews").select("place_id,user_id,rating,created_at,places(name,attributes)")
      .eq("is_hidden", false).gte("approved_at", since),
    admin.from("place_detail_requests").select("place_id,user_id,changes,places(name,attributes)")
      .eq("status", "approved").is("reverted_at", null).gte("reviewed_at", since),
  ]);

  const dup = (r: any) => !!r.places?.attributes?.duplicate_of;
  // Per place: what happened, and who did it (so people aren't told about their own changes)
  const events: { placeId: string; placeName: string; byUser: string | null; kind: "review" | "edit"; text: string }[] = [];
  for (const r of ((reviews ?? []) as any[]).filter((x) => !dup(x))) {
    events.push({ placeId: r.place_id, placeName: r.places?.name ?? "", byUser: r.user_id, kind: "review", text: "המלצה חדשה" });
  }
  for (const e of ((edits ?? []) as any[]).filter((x) => !dup(x))) {
    const fields = Object.keys(e.changes ?? {}).map(label).join(", ");
    if (!fields) continue;
    events.push({ placeId: e.place_id, placeName: e.places?.name ?? "", byUser: e.user_id, kind: "edit", text: `עודכן: ${fields}` });
  }
  if (!events.length) return { sent: 0, failed: 0 };

  const placeIds = Array.from(new Set(events.map((e) => e.placeId)));
  const [{ data: follows }, { data: owners }] = preview
    ? [{ data: placeIds.slice(0, 5).map((p) => ({ user_id: preview.userId, place_id: p })) }, { data: [] }]
    : await Promise.all([
      admin.from("place_follows").select("user_id,place_id").eq("email_alerts", true).in("place_id", placeIds),
      admin.from("place_owner_claims").select("user_id,place_id").eq("status", "approved").in("place_id", placeIds),
    ]);

  // user -> place -> items (a follower and an owner of the same place gets it once)
  const perUser = new Map<string, Map<string, Item[]>>();
  const add = (userId: string, ev: (typeof events)[number]) => {
    if (!userId || (!preview && ev.byUser === userId)) return;
    const places = perUser.get(userId) ?? new Map<string, Item[]>();
    const list = places.get(ev.placeId) ?? [];
    if (!list.some((i) => i.text === ev.text)) list.push({ placeId: ev.placeId, placeName: ev.placeName, text: ev.text });
    places.set(ev.placeId, list);
    perUser.set(userId, places);
  };
  for (const f of (follows ?? []) as { user_id: string; place_id: string }[]) {
    for (const ev of events.filter((e) => e.placeId === f.place_id)) add(f.user_id, ev);
  }
  for (const o of (owners ?? []) as { user_id: string | null; place_id: string }[]) {
    if (!o.user_id) continue;
    for (const ev of events.filter((e) => e.placeId === o.place_id)) add(o.user_id, ev);
  }

  const resend = new Resend(key);
  let sent = 0, failed = 0;
  for (const [userId, places] of Array.from(perUser.entries())) {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      const user = data?.user;
      // No email, or they used the unsubscribe link
      if (!user?.email || (!preview && user.user_metadata?.email_alerts_off)) continue;
      const unsubUrl = `${origin}/api/unsubscribe?u=${userId}&t=${signUnsubscribe(userId)}`;
      const blocks = Array.from(places.entries()).map(([placeId, items]) =>
        `<h3 style="margin:16px 0 4px"><a href="${origin}/place/${placeId}">${escapeHtml(items[0].placeName)}</a></h3>`
        + `<ul style="margin:0">${items.map((i) => `<li>${escapeHtml(i.text)}</li>`).join("")}</ul>`).join("");
      const { error } = await resend.emails.send({
        from,
        to: user.email,
        ...(serverEnv.RESEND_REPLY_TO ? { replyTo: serverEnv.RESEND_REPLY_TO } : {}),
        subject: places.size === 1 ? `עדכון ב${Array.from(places.values())[0][0].placeName}` : `עדכונים ב-${places.size} מקומות שאתם עוקבים אחריהם`,
        headers: { "List-Unsubscribe": `<${unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        html: `<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>יש חדש במקומות שלכם</h2>${blocks}
          <p style="margin-top:24px;font-size:12px;color:#667">קיבלתם את המייל כי הפעלתם עדכונים במייל, או כי אתם בעלי המקום ב-GiveMyTime.
          <a href="${unsubUrl}">להפסקת העדכונים במייל</a></p></div>`,
      });
      if (error) { console.error("[follow-alerts] send failed:", userId, error); failed++; } else sent++;
    } catch (e) {
      console.error("[follow-alerts] threw:", userId, e);
      failed++;
    }
  }
  return { sent, failed };
}
