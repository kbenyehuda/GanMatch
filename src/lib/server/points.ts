import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Points for contributions (decided 2026-11-21). Nothing is stored: points are counted from the rows we
// already keep, so past contributors are credited too and nothing can drift out of sync.
// Only approved work counts; waiting work is shown separately as "on the way".
// A daily cap per person keeps junk edits from paying (Israel calendar day).

export const POINT_VALUES = {
  recommendation: 5, // a recommendation that went public (written in the app, not WhatsApp)
  newPlace: 5, // a place the person added that is now shown
  detailEdit: 3, // an approved edit that fills in or fixes facts
} as const;

export const DAILY_POINT_CAP = 20;

export type PointsSummary = {
  points: number;
  pending: number;
  recommendations: number;
  newPlaces: number;
  detailEdits: number;
};

type Event = { userId: string; at: string; pts: number; kind: keyof typeof POINT_VALUES | "pending" };

const israelDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });

const empty = (): PointsSummary => ({ points: 0, pending: 0, recommendations: 0, newPlaces: 0, detailEdits: 0 });

/** Points per person. Pass userId for one person, or leave it out for everyone (admin list). */
export async function computePoints(admin: SupabaseClient, userId?: string): Promise<Map<string, PointsSummary>> {
  const events: Event[] = [];
  const LIMIT = 10000;

  let rev = admin.from("place_reviews")
    .select("user_id,created_at,approved_at,is_hidden,check_status,rating")
    .limit(LIMIT);
  let places = admin.from("places")
    .select("suggested_by,created_at,is_hidden")
    .eq("source", "community").not("suggested_by", "is", null).limit(LIMIT);
  let edits = admin.from("place_detail_requests")
    .select("user_id,created_at,status,reverted_at")
    .in("status", ["pending", "approved"]).limit(LIMIT);
  if (userId) {
    rev = rev.eq("user_id", userId);
    places = places.eq("suggested_by", userId);
    edits = edits.eq("user_id", userId);
  }
  const [r, p, e] = await Promise.all([rev, places, edits]);

  for (const row of r.data ?? []) {
    if (!row.user_id) continue;
    const at = (row.approved_at ?? row.created_at) as string;
    // App-written recommendations carry a check_status; WhatsApp-imported ones have none and earn nothing
    if (row.check_status === "auto_ok" || row.check_status === "approved") {
      if (!row.is_hidden) events.push({ userId: row.user_id, at, pts: POINT_VALUES.recommendation, kind: "recommendation" });
    } else if (row.check_status === "held" && Number(row.rating) >= 3) {
      events.push({ userId: row.user_id, at, pts: POINT_VALUES.recommendation, kind: "pending" });
    }
  }
  for (const row of p.data ?? []) {
    if (!row.suggested_by) continue;
    events.push({
      userId: row.suggested_by, at: row.created_at as string,
      pts: POINT_VALUES.newPlace, kind: row.is_hidden ? "pending" : "newPlace",
    });
  }
  for (const row of e.data ?? []) {
    if (!row.user_id || row.reverted_at) continue;
    events.push({
      userId: row.user_id, at: row.created_at as string,
      pts: POINT_VALUES.detailEdit, kind: row.status === "approved" ? "detailEdit" : "pending",
    });
  }

  // Oldest first, so the daily cap cuts the latest items of a day
  events.sort((a, b) => a.at.localeCompare(b.at));
  const perDay = new Map<string, number>();
  const out = new Map<string, PointsSummary>();
  for (const ev of events) {
    const s = out.get(ev.userId) ?? empty();
    out.set(ev.userId, s);
    if (ev.kind === "pending") { s.pending += ev.pts; continue; }
    const key = `${ev.userId}|${israelDay(ev.at)}`;
    const used = perDay.get(key) ?? 0;
    if (used + ev.pts > DAILY_POINT_CAP) continue;
    perDay.set(key, used + ev.pts);
    s.points += ev.pts;
    if (ev.kind === "recommendation") s.recommendations++;
    else if (ev.kind === "newPlace") s.newPlaces++;
    else if (ev.kind === "detailEdit") s.detailEdits++;
  }
  return out;
}

export async function pointsForUser(admin: SupabaseClient, userId: string): Promise<PointsSummary> {
  return (await computePoints(admin, userId)).get(userId) ?? empty();
}
