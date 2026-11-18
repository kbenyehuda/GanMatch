import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/require-admin";

// GET /api/admin/analytics/overview — "Today at a glance" for the analytics page:
//  - visitors / signed in / engagement for today (so far) and yesterday, from analytics_summary()
//  - the KPI "new information": what people added (recommendations, places, owner claims, edits,
//    pin moves) today, yesterday and in the last 7 days, plus the latest items.
// Days are Israel days. Kept separate from /api/admin/analytics so it can't slow down or break it.

const TZ = "Asia/Jerusalem";

/** The start (as a real Date) of the Israel day `offsetDays` from today. */
function israelMidnight(offsetDays: number): Date {
  const now = new Date();
  const ilNow = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  const utcNow = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = ilNow.getTime() - utcNow.getTime();
  const mid = new Date(ilNow);
  mid.setHours(0, 0, 0, 0);
  mid.setDate(mid.getDate() + offsetDays);
  return new Date(mid.getTime() - offsetMs);
}

type Item = { kind: "review" | "place" | "claim" | "edit" | "move"; label: string; at: string };

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  const db = auth.admin;

  const now = new Date();
  const todayStart = israelMidnight(0);
  const yesterdayStart = israelMidnight(-1);
  const weekStart = israelMidnight(-6);

  const day = async (since: Date, until: Date) => {
    const { data } = await db.rpc("analytics_summary", { p_since: since.toISOString(), p_until: until.toISOString(), p_category: null });
    return {
      people: Number(data?.totals?.people ?? 0),
      signed_in: Number(data?.totals?.signed_in ?? 0),
      visits: Number(data?.funnel?.visits ?? 0),
      opened: Number(data?.funnel?.opened ?? 0),
      reviews: Number(data?.funnel?.reviews ?? 0),
      outbound: Number(data?.funnel?.outbound ?? 0),
      sources: ((data?.sources ?? []) as { src: string; people: number }[]).slice(0, 6)
        .map((s) => ({ src: s.src, people: Number(s.people) })),
    };
  };

  const since = weekStart.toISOString();
  const [today, yesterday, rev, pl, cl, de, lo] = await Promise.all([
    day(todayStart, now),
    day(yesterdayStart, todayStart),
    db.from("place_reviews").select("id,created_at,rating,is_hidden,places(name)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("places").select("id,created_at,name,is_hidden").eq("source", "community").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("place_owner_claims").select("id,created_at,places(name)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("place_detail_requests").select("id,created_at,places(name)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("place_location_requests").select("id,created_at,places(name)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);

  const rows = {
    review: (rev.data ?? []) as any[],
    place: (pl.data ?? []) as any[],
    claim: (cl.data ?? []) as any[],
    edit: (de.data ?? []) as any[],
    move: (lo.data ?? []) as any[],
  };

  const count = (list: any[], from: Date, to: Date | null) =>
    list.filter((r) => {
      const t = new Date(r.created_at).getTime();
      return t >= from.getTime() && (!to || t < to.getTime());
    }).length;
  const windows = (list: any[]) => ({
    today: count(list, todayStart, null),
    yesterday: count(list, yesterdayStart, todayStart),
    week: count(list, weekStart, null),
  });
  const contributions = {
    review: windows(rows.review),
    place: windows(rows.place),
    claim: windows(rows.claim),
    edit: windows(rows.edit),
    move: windows(rows.move),
  };

  const latest: Item[] = [
    ...rows.review.map((r): Item => ({ kind: "review", at: r.created_at, label: `${r.places?.name ?? ""} · ${"★".repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}${r.is_hidden ? " (held)" : ""}` })),
    // A private person (babysitter) is hidden until she agrees: keep her name out of the page
    ...rows.place.map((r): Item => ({ kind: "place", at: r.created_at, label: r.is_hidden ? "Private person (hidden until she agrees)" : String(r.name ?? "") })),
    ...rows.claim.map((r): Item => ({ kind: "claim", at: r.created_at, label: String(r.places?.name ?? "") })),
    ...rows.edit.map((r): Item => ({ kind: "edit", at: r.created_at, label: String(r.places?.name ?? "") })),
    ...rows.move.map((r): Item => ({ kind: "move", at: r.created_at, label: String(r.places?.name ?? "") })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);

  return NextResponse.json({
    generated_at: now.toISOString(),
    today,
    yesterday,
    contributions,
    latest,
  });
}
