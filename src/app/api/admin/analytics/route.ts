import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/require-admin";
import { lookupUsers } from "@/lib/server/user-lookup";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const CATEGORIES = new Set(["kids", "doctor", "cosmetics", "cafe", "sport", "attraction", "food"]);

// GET /api/admin/analytics?days=1|7|30|0&category=kids — analytics_summary() for the range, plus the
// previous range of the same length (for trends), with signed-in people's names/emails from auth.users.
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const params = new URL(req.url).searchParams;
  const daysRaw = Number(params.get("days") ?? "7");
  const days = Number.isFinite(daysRaw) && daysRaw >= 0 ? Math.min(daysRaw, 3650) : 7;
  const category = CATEGORIES.has(params.get("category") ?? "") ? params.get("category") : null;

  const now = Date.now();
  const until = new Date(now);
  const since = days === 0 ? new Date(0) : new Date(now - days * 86_400_000);
  const prevSince = new Date(now - 2 * days * 86_400_000);

  const [cur, prev] = await Promise.all([
    auth.admin.rpc("analytics_summary", { p_since: since.toISOString(), p_until: until.toISOString(), p_category: category }),
    days === 0
      ? Promise.resolve({ data: null, error: null })
      : auth.admin.rpc("analytics_summary", { p_since: prevSince.toISOString(), p_until: since.toISOString(), p_category: category }),
  ]);
  if (cur.error) return NextResponse.json({ error: cur.error.message }, { status: 500 });
  const data = cur.data;

  const ids = new Set<string>();
  for (const p of (data?.people ?? []) as { person: string }[]) if (UUID_RE.test(p.person)) ids.add(p.person);
  for (const r of (data?.recent ?? []) as { person: string }[]) if (UUID_RE.test(r.person)) ids.add(r.person);

  const users = await lookupUsers(auth.admin, Array.from(ids));

  // Hearts (saved places) and follows (email alerts on) of signed-in people. Counts and place names only.
  // Not limited to the date range: it is the current state. Guests' hearts live in their own browser.
  let likes: { hearts: number; followed: number; people: number; people_followed: number; places: { place_id: string; name: string | null; hearts: number; followed: number }[] } | null = null;
  const fol = await auth.admin.from("place_follows").select("user_id,place_id,email_alerts").limit(20000);
  if (!fol.error) {
    const rows = (fol.data ?? []) as { user_id: string; place_id: string; email_alerts: boolean | null }[];
    const placeIds = Array.from(new Set(rows.map((r) => r.place_id)));
    const names = new Map<string, { name: string | null; category: string | null }>();
    for (let i = 0; i < placeIds.length; i += 200) {
      const { data: pl } = await auth.admin.from("places").select("id,name,category").in("id", placeIds.slice(i, i + 200));
      for (const p of (pl ?? []) as { id: string; name: string | null; category: string | null }[]) names.set(p.id, { name: p.name, category: p.category });
    }
    const kept = rows.filter((r) => !category || names.get(r.place_id)?.category === category);
    const per = new Map<string, { hearts: number; followed: number }>();
    for (const r of kept) {
      const c = per.get(r.place_id) ?? { hearts: 0, followed: 0 };
      c.hearts += 1;
      if (r.email_alerts) c.followed += 1;
      per.set(r.place_id, c);
    }
    likes = {
      hearts: kept.length,
      followed: kept.filter((r) => r.email_alerts).length,
      people: new Set(kept.map((r) => r.user_id)).size,
      people_followed: new Set(kept.filter((r) => r.email_alerts).map((r) => r.user_id)).size,
      places: Array.from(per.entries())
        .map(([place_id, c]) => ({ place_id, name: names.get(place_id)?.name ?? null, ...c }))
        .sort((a, b) => b.hearts + b.followed - (a.hearts + a.followed))
        .slice(0, 50),
    };
  }

  // Which of the 3 main categories people looked at (picked it, or opened/previewed a place in it).
  // Counted from telemetry events; one person = signed-in user, else browser. Counts only, no names.
  const MAIN = ["kids", "doctor", "cosmetics"] as const;
  let categories: {
    people: number; by_cat: Record<string, number>; one: number; several: number;
    combos: { cats: string[]; people: number }[];
    by_day: { day: string; kids: number; doctor: number; cosmetics: number }[];
  } | null = null;
  try {
    type Row = { visitor_id: string | null; user_id: string | null; event_name: string; entity_id: string | null; metadata: { category?: string } | null; created_at: string };
    const rows: Row[] = [];
    for (let from = 0; from < 60000; from += 1000) {
      let q = auth.admin.from("telemetry_events")
        .select("visitor_id,user_id,event_name,entity_id,metadata,created_at")
        .in("event_name", ["category_selected", "place_opened", "place_preview"])
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (days !== 0) q = q.gte("created_at", since.toISOString());
      const { data: chunk, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...((chunk ?? []) as Row[]));
      if ((chunk ?? []).length < 1000) break;
    }
    const placeIds = Array.from(new Set(rows.filter((r) => r.event_name !== "category_selected" && r.entity_id && UUID_RE.test(r.entity_id)).map((r) => r.entity_id as string)));
    const placeCat = new Map<string, string>();
    for (let i = 0; i < placeIds.length; i += 200) {
      const { data: pl } = await auth.admin.from("places").select("id,category").in("id", placeIds.slice(i, i + 200));
      for (const p of (pl ?? []) as { id: string; category: string | null }[]) if (p.category) placeCat.set(p.id, p.category);
    }
    const perPerson = new Map<string, Set<string>>();
    const perDay = new Map<string, Record<string, Set<string>>>();
    for (const r of rows) {
      const person = r.user_id ?? (r.visitor_id ? `v:${r.visitor_id}` : null);
      if (!person) continue;
      const cat = r.event_name === "category_selected" ? r.metadata?.category : r.entity_id ? placeCat.get(r.entity_id) : undefined;
      if (!cat || !(MAIN as readonly string[]).includes(cat)) continue;
      if (category && cat !== category) continue;
      const set = perPerson.get(person) ?? new Set<string>();
      set.add(cat);
      perPerson.set(person, set);
      const day = new Date(r.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
      const d = perDay.get(day) ?? { kids: new Set<string>(), doctor: new Set<string>(), cosmetics: new Set<string>() };
      d[cat].add(person);
      perDay.set(day, d);
    }
    const by_cat: Record<string, number> = { kids: 0, doctor: 0, cosmetics: 0 };
    const comboCount = new Map<string, number>();
    let one = 0;
    let several = 0;
    for (const set of Array.from(perPerson.values())) {
      for (const c of Array.from(set)) by_cat[c] += 1;
      if (set.size === 1) one += 1; else several += 1;
      const key = MAIN.filter((c) => set.has(c)).join(",");
      comboCount.set(key, (comboCount.get(key) ?? 0) + 1);
    }
    categories = {
      people: perPerson.size, by_cat, one, several,
      combos: Array.from(comboCount.entries()).map(([k, n]) => ({ cats: k.split(","), people: n })).sort((a, b) => b.people - a.people),
      by_day: Array.from(perDay.entries()).sort(([a], [b]) => a.localeCompare(b))
        .map(([day, d]) => ({ day, kids: d.kids.size, doctor: d.doctor.size, cosmetics: d.cosmetics.size })),
    };
  } catch { categories = null; }

  // Held reviews written by real users in the app (not the WhatsApp-seeded ones, which are held back on purpose).
  let held_user = 0;
  {
    const { count } = await auth.admin.from("place_reviews")
      .select("id", { count: "exact", head: true })
      .eq("check_status", "held").is("whatsapp_reviewer_name", null);
    held_user = count ?? 0;
  }

  return NextResponse.json({ ...data, prev_pulse: prev.data?.pulse ?? null, users, days, category, likes, categories, held_user });
}
