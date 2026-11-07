"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { ANALYTICS_EVENT_LABELS } from "@/lib/analytics-events";
import { isBrowserExcluded, includeThisBrowser } from "@/lib/analytics";

// Admin-only page, in English by the admin's choice (2026-11-02). Layout: pulse KPIs → demand + funnel →
// content inflow + moderation → who/when detail. Admins' own visits aren't counted.

const CATEGORY_EN: Record<string, string> = {
  kids: "Kids", doctor: "Doctors", cosmetics: "Cosmetics", cafe: "Cafes", sport: "Sport", attraction: "Attractions", food: "Food",
};
const categoryLabel = (c: string | null | undefined) => (c ? CATEGORY_EN[c] ?? c : "");
const srcLabel = (s: string | null) => (!s || s === "ישיר" ? "Direct" : s);

type Pulse = {
  dau: number; wau: number; sessions: number; intent_sessions: number;
  reviews_seeded: number; reviews_organic: number; organic_in_range: number;
  places_total: number; places_3plus: number;
};
type Person = {
  person: string; first_seen: string; last_seen: string; visits: number; events: number;
  place_opens: number; contact_clicks: number; src: string | null; device: string | null;
};
type Recent = { at: string; person: string; event: string; place_id: string | null; meta: Record<string, any> | null };
type ReviewRow = { day: string; cat: string; organic: number; seeded: number };
type Summary = {
  totals: { people: number; signed_in: number; visits: number; events: number; place_opens: number; contact_clicks: number };
  pulse: Pulse;
  prev_pulse: Pulse | null;
  funnel: { visits: number; opened: number; reviews: number; outbound: number };
  filters: { label: string; category: string | null; count: number; sessions: number }[];
  zero_searches: { q: string; count: number; last: string }[];
  new_reviews: ReviewRow[];
  review_mix: { seeded: number; anonymous: number; named: number };
  queue: {
    held_reviews: number; held_latest: { place: string; place_id: string; at: string; reasons: string[] | null }[];
    detail_requests: number; location_requests: number; report_clicks: number; owner_clicks: number;
  };
  by_day: { day: string; people: number; visits: number; events: number }[];
  by_hour: { hour: number; visits: number }[];
  events: { event: string; count: number; people: number }[];
  sources: { src: string; visits: number; people: number }[];
  places: { place_id: string; name: string | null; category: string | null; opens: number; people: number; clicks: number }[];
  searches: { q: string; count: number; people: number }[];
  people: Person[];
  recent: Recent[];
  users: Record<string, { name: string | null; email: string | null }>;
};

const RANGES = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" },
];
const VERTICALS = [
  { id: "", label: "All" },
  { id: "kids", label: "Kids" },
  { id: "doctor", label: "Doctors" },
  { id: "cosmetics", label: "Cosmetics" },
];

const TZ = "Asia/Jerusalem";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const dayLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const eventLabel = (e: string) => ANALYTICS_EVENT_LABELS[e] ?? e;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const num = (n: number) => n.toLocaleString("en-US");

/** One row per day: organic + seeded, and a "Kids 3, Doctors 1" breakdown. */
function groupReviewDays(rows: ReviewRow[]) {
  const byDay = new Map<string, { day: string; organic: number; seeded: number; total: number; cats: Record<string, number> }>();
  for (const r of rows) {
    const d = byDay.get(r.day) ?? { day: r.day, organic: 0, seeded: 0, total: 0, cats: {} };
    d.organic += r.organic;
    d.seeded += r.seeded;
    d.total += r.organic + r.seeded;
    d.cats[r.cat] = (d.cats[r.cat] ?? 0) + r.organic + r.seeded;
    byDay.set(r.day, d);
  }
  return Array.from(byDay.values())
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((d) => ({ ...d, byCat: Object.entries(d.cats).map(([c, n]) => `${categoryLabel(c)} ${n}`).join(", ") }));
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden">
      <div className="h-full rounded bg-[#1F5BB5]" style={{ width: `${max && value ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm space-y-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-[#0A2B6B]">{title}</h2>
        {right}
      </div>
      {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
      {children}
    </section>
  );
}

/** Change vs the previous period of the same length; "pts" for rates, % for counts. */
function Trend({ cur, prev, unit = "%" }: { cur: number; prev: number | null | undefined; unit?: "%" | "pts" }) {
  if (prev == null) return null;
  const diff = unit === "pts" ? Math.round((cur - prev) * 10) / 10 : prev ? Math.round(((cur - prev) / prev) * 100) : null;
  if (diff == null) return cur ? <span className="text-xs text-gray-400">new</span> : null;
  if (diff === 0) return <span className="text-xs text-gray-400">no change</span>;
  const up = diff > 0;
  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-700" : "text-rose-700"}`}>
      {up ? "▲" : "▼"} {Math.abs(diff)}{unit === "pts" ? " pts" : "%"}
    </span>
  );
}

function Kpi({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[#0A2B6B]">{value}</span>
        {trend}
      </div>
      {sub ? <div className="mt-1 text-xs text-gray-500">{sub}</div> : null}
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user, loading } = useSession();
  const [days, setDays] = useState(30);
  const [vertical, setVertical] = useState("");
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [openPeople, setOpenPeople] = useState<Set<string>>(new Set());
  const togglePerson = (person: string) =>
    setOpenPeople((prev) => {
      const next = new Set(prev);
      if (next.has(person)) next.delete(person); else next.add(person);
      return next;
    });
  const jumpToPerson = (person: string) => {
    setOpenPeople((prev) => new Set(prev).add(person));
    setTimeout(() => document.getElementById(`actions-${person}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const [tag, setTag] = useState("");
  const [target, setTarget] = useState("");
  const [copied, setCopied] = useState(false);
  const [excluded, setExcluded] = useState(false);
  useEffect(() => { setExcluded(isBrowserExcluded()); }, []);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Missing access token");
      const res = await fetch(`/api/admin/analytics?days=${days}${vertical ? `&category=${vertical}` : ""}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Failed to load");
      setData(json as Summary);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load");
    } finally {
      setReloading(false);
    }
  }, [user, days, vertical]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const guestNumbers = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 0;
    for (const pr of [...(data?.people ?? [])].reverse()) if (pr.person.startsWith("v:")) map[pr.person] = ++n;
    return map;
  }, [data]);

  const who = useCallback((person: string) => {
    if (person.startsWith("v:")) return guestNumbers[person] ? `Guest #${guestNumbers[person]}` : "Guest";
    const u = data?.users?.[person];
    return u?.name || u?.email || "Signed-in user";
  }, [data, guestNumbers]);

  const link = useMemo(() => {
    const clean = tag.trim().replace(/\s+/g, "-");
    if (!clean || typeof window === "undefined") return "";
    const placeId = target.match(/\/place\/([0-9a-f-]{36})/i)?.[1];
    return `${window.location.origin}/${placeId ? `place/${placeId}` : ""}?src=${encodeURIComponent(clean)}`;
  }, [tag, target]);
  const badTarget = target.trim() !== "" && !/\/place\/[0-9a-f-]{36}/i.test(target);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  const p = data?.pulse;
  const pp = data?.prev_pulse;
  const intentRate = p ? pct(p.intent_sessions, p.sessions) : 0;
  const prevIntentRate = pp && pp.sessions ? pct(pp.intent_sessions, pp.sessions) : null;
  const organicShare = p ? pct(p.reviews_organic, p.reviews_organic + p.reviews_seeded) : 0;

  const f = data?.funnel;
  const funnelSteps = f ? [
    { label: "Visited (map / list)", value: f.visits },
    { label: "Opened a place", value: f.opened },
    { label: "Read the reviews", value: f.reviews },
    { label: "Outbound (call, WhatsApp, website, navigate, save, share)", value: f.outbound },
  ] : [];

  const reviewDays = groupReviewDays(data?.new_reviews ?? []);
  const maxReviewDay = Math.max(0, ...reviewDays.map((d) => d.total));
  const mix = data?.review_mix;
  const mixTotal = mix ? mix.seeded + mix.anonymous + mix.named : 0;

  const maxFilter = Math.max(0, ...(data?.filters ?? []).map((x) => x.sessions));
  const maxDay = Math.max(0, ...(data?.by_day ?? []).map((d) => d.people));
  const hours = Array.from({ length: 24 }, (_, h) => data?.by_hour.find((x) => x.hour === h)?.visits ?? 0);
  const maxHour = Math.max(0, ...hours);
  // Recent actions grouped per person; newest action first inside a group, most recently active person first.
  const recentGroups = (() => {
    const byPerson = new Map<string, Recent[]>();
    for (const r of [...(data?.recent ?? [])].sort((a, b) => b.at.localeCompare(a.at))) {
      const list = byPerson.get(r.person) ?? [];
      list.push(r);
      byPerson.set(r.person, list);
    }
    return Array.from(byPerson.entries()).map(([person, actions]) => ({ person, actions }));
  })();
  const allOpen = recentGroups.length > 0 && recentGroups.every((g) => openPeople.has(g.person));
  const q = data?.queue;

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6 space-y-4 min-h-screen" dir="ltr">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">Back to site</a>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded border text-sm ${days === r.days ? "bg-[#0A2B6B] text-white" : "bg-white"}`}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-6 w-px bg-gray-200" />
        <div className="flex flex-wrap gap-1">
          {VERTICALS.map((v) => (
            <button key={v.id} onClick={() => setVertical(v.id)}
              className={`px-3 py-1.5 rounded border text-sm ${vertical === v.id ? "bg-[#1F5BB5] text-white" : "bg-white"}`}>
              {v.label}
            </button>
          ))}
        </div>
        <button className="ml-auto px-3 py-1.5 rounded border text-sm bg-white" onClick={load} disabled={reloading}>
          {reloading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {excluded ? (
          <>
            This browser is not counted (you used it as admin); while you&apos;re signed in here as admin every tab is you. Test as a guest in a private window, or sign out and{" "}
            <button className="text-[#1F5BB5] underline" onClick={() => { includeThisBrowser(); setExcluded(false); }}>count this browser again</button>.
          </>
        ) : (
          <>This browser is counted until you sign in here as admin. Test as a guest in a private window.</>
        )}
        {" "}Times are Israel time. The vertical buttons narrow place-related numbers; visits and searches are site-wide.
      </p>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {data && p ? (
        <>
          {/* Tier 1: pulse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Active people (last 7 days)" value={num(p.wau)}
              sub={`${num(p.dau)} in the last 24 hours`} trend={<Trend cur={p.wau} prev={pp?.wau} />} />
            <Kpi label="Organic recommendations" value={`${organicShare}%`}
              sub={`${num(p.reviews_organic)} from users · ${num(p.reviews_seeded)} seeded from WhatsApp · ${num(p.organic_in_range)} new from users in range`} />
            <Kpi label="High-intent visits" value={`${intentRate}%`}
              sub={`${num(p.intent_sessions)} of ${num(p.sessions)} visits called, messaged, navigated, saved or shared`}
              trend={<Trend cur={intentRate} prev={prevIntentRate} unit="pts" />} />
            <Kpi label="Places with 3+ recommendations" value={`${num(p.places_3plus)} / ${num(p.places_total)}`}
              sub={`${pct(p.places_3plus, p.places_total)}% of listed places`} />
          </div>

          {/* Tier 2: demand + funnel */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="What people are looking for" hint="Filter options switched on, by share of visits that used them">
              <div className="space-y-1">
                {data.filters.map((x) => (
                  <div key={x.label} className="flex items-center gap-2 text-sm">
                    <span className="w-44 shrink-0 truncate" dir="auto" title={x.label}>{x.label}</span>
                    <Bar value={x.sessions} max={maxFilter} />
                    <span className="w-24 shrink-0 text-right text-xs text-gray-600">{pct(x.sessions, data.totals.visits)}% of visits</span>
                  </div>
                ))}
                {data.filters.length === 0 && <div className="text-sm text-gray-500">No filters used yet.</div>}
              </div>
              <h3 className="pt-3 text-sm font-bold text-[#0A2B6B]">Searches with no results</h3>
              <p className="text-xs text-gray-500">What to add or recruit next.</p>
              <table className="w-full text-sm">
                <tbody>
                  {data.zero_searches.map((s) => (
                    <tr key={s.q} className="border-t">
                      <td className="py-1" dir="auto">{s.q}</td>
                      <td className="text-right text-xs text-gray-600">×{s.count}</td>
                      <td className="text-right text-xs text-gray-500">{when(s.last)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.zero_searches.length === 0 && <div className="text-sm text-gray-500">None so far.</div>}
            </Section>

            <Section title="Intent funnel" hint="Share of visits that reached each step">
              <div className="space-y-3 pt-1">
                {funnelSteps.map((s, i) => {
                  const share = pct(s.value, funnelSteps[0].value);
                  const prevStep = i > 0 ? funnelSteps[i - 1].value : null;
                  return (
                    <div key={s.label}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span>{i + 1}. {s.label}</span>
                        <span className="font-semibold whitespace-nowrap">{i === 0 ? num(s.value) : `${share}%`}
                          <span className="ml-1 text-xs font-normal text-gray-500">{i === 0 ? "visits" : `(${num(s.value)})`}</span>
                        </span>
                      </div>
                      <div className="mt-1 h-6 rounded bg-gray-100 overflow-hidden">
                        <div className="h-full rounded bg-[#1F5BB5]" style={{ width: `${funnelSteps[0].value ? Math.max(s.value ? 1 : 0, share) : 0}%`, opacity: 1 - i * 0.18 }} />
                      </div>
                      {prevStep ? <div className="text-xs text-gray-500">{pct(s.value, prevStep)}% of the step before</div> : null}
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* Tier 3: content inflow + moderation */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="New recommendations" hint="Per day in the selected range; dark = from users, light = seeded from WhatsApp">
              <div className="space-y-1">
                {reviewDays.map((d) => (
                  <div key={d.day} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-gray-600">{dayLabel(d.day)}</span>
                    <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden flex">
                      <div className="h-full bg-[#0A2B6B]" style={{ width: `${maxReviewDay ? (d.organic / maxReviewDay) * 100 : 0}%` }} />
                      <div className="h-full bg-[#9DB8E3]" style={{ width: `${maxReviewDay ? (d.seeded / maxReviewDay) * 100 : 0}%` }} />
                    </div>
                    <span className="w-44 shrink-0 text-right text-xs text-gray-600 truncate" title={d.byCat}>{d.total} · {d.byCat}</span>
                  </div>
                ))}
                {reviewDays.length === 0 && <div className="text-sm text-gray-500">No new recommendations in this range.</div>}
              </div>
              {mix && mixTotal ? (
                <>
                  <h3 className="pt-3 text-sm font-bold text-[#0A2B6B]">Where all recommendations come from</h3>
                  <div className="flex h-4 rounded overflow-hidden">
                    <div className="bg-[#9DB8E3]" style={{ width: `${pct(mix.seeded, mixTotal)}%` }} />
                    <div className="bg-[#1F5BB5]" style={{ width: `${pct(mix.anonymous, mixTotal)}%` }} />
                    <div className="bg-[#0A2B6B]" style={{ width: `${pct(mix.named, mixTotal)}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 text-xs text-gray-600">
                    <span><span className="inline-block h-2 w-2 rounded-sm bg-[#9DB8E3]" /> Seeded / paraphrased from WhatsApp: {num(mix.seeded)}</span>
                    <span><span className="inline-block h-2 w-2 rounded-sm bg-[#1F5BB5]" /> Signed-in user, anonymous: {num(mix.anonymous)}</span>
                    <span><span className="inline-block h-2 w-2 rounded-sm bg-[#0A2B6B]" /> Signed-in user, with a name: {num(mix.named)}</span>
                  </div>
                </>
              ) : null}
            </Section>

            {q ? (
              <Section title="Moderation queue" hint="Waiting for you now (not limited by the date range), plus email clicks in the range">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <a href="/admin/held-reviews" className="rounded border p-2 hover:bg-gray-50">
                    <div className="text-2xl font-bold text-[#0A2B6B]">{q.held_reviews}</div>Held recommendations
                  </a>
                  <a href="/admin/place-detail-requests" className="rounded border p-2 hover:bg-gray-50">
                    <div className="text-2xl font-bold text-[#0A2B6B]">{q.detail_requests}</div>Detail corrections
                  </a>
                  <a href="/admin/place-location-requests" className="rounded border p-2 hover:bg-gray-50">
                    <div className="text-2xl font-bold text-[#0A2B6B]">{q.location_requests}</div>Location fixes
                  </a>
                  <div className="rounded border p-2">
                    <div className="text-2xl font-bold text-[#0A2B6B]">{q.report_clicks} / {q.owner_clicks}</div>
                    &quot;Report&quot; / &quot;Your business?&quot; clicks
                    <div className="text-xs text-gray-500">&quot;Report&quot; opens an email to you; &quot;Your business?&quot; opens the in-app owner form.</div>
                  </div>
                  <a href="/admin/owner-claims" className="rounded border p-2 hover:bg-gray-50">
                    <div className="text-2xl font-bold text-[#0A2B6B]">→</div>Owner requests (בקשות בעלות)
                  </a>
                </div>
                {q.held_latest.length ? (
                  <>
                    <h3 className="pt-2 text-sm font-bold text-[#0A2B6B]">Latest held</h3>
                    <ul className="divide-y text-sm">
                      {q.held_latest.map((h, i) => (
                        <li key={`${h.place_id}-${i}`} className="py-1 flex flex-wrap gap-x-2">
                          <span className="text-xs text-gray-500 w-24 shrink-0">{when(h.at)}</span>
                          <a href={`/place/${h.place_id}`} target="_blank" rel="noreferrer" className="text-[#1F5BB5] hover:underline" dir="auto">{h.place}</a>
                          {h.reasons?.length ? <span className="text-xs text-gray-500" dir="auto">· {h.reasons.join(", ")}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Section>
            ) : null}
          </div>

          {/* Tier 4: who / when / where from */}
          <Section title="Create a tagged link" hint="Give each group or post its own link; 'Where they came from' shows how many came from each. The tag is removed from the address after they arrive, so re-shares aren't credited to it.">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">Tag</span>
                <input value={tag} onChange={(e) => { setTag(e.target.value); setCopied(false); }}
                  placeholder="e.g. borochov-parents" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">Where the link goes (optional)</span>
                <input value={target} onChange={(e) => { setTarget(e.target.value); setCopied(false); }}
                  placeholder="Empty = home page; or paste a place link" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
                {badTarget ? <span className="text-xs text-rose-700">That isn&apos;t a place link (it should look like /place/...). The link will go to the home page.</span> : null}
              </label>
            </div>
            {link ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-gray-50 border px-2 py-1 text-xs break-all">{link}</code>
                <button className="px-3 py-1.5 rounded bg-[#1F5BB5] text-white text-sm"
                  onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => {})}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
          </Section>

          <div className="grid lg:grid-cols-2 gap-4">
            <Section title="Where they came from" hint="The link tag (?src=), or the site they came from">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 text-xs"><th className="text-left font-normal">Source</th><th className="font-normal">Visits</th><th className="font-normal">People</th></tr></thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.src} className="border-t"><td className="py-1" dir="auto">{srcLabel(s.src)}</td><td className="text-center">{s.visits}</td><td className="text-center">{s.people}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="By day" hint="Different people each day">
              <div className="space-y-1">
                {data.by_day.map((d) => (
                  <div key={d.day} className="flex items-center gap-2 text-sm">
                    <span className="w-24 shrink-0 text-gray-600">{dayLabel(d.day)}</span>
                    <Bar value={d.people} max={maxDay} />
                    <span className="w-32 shrink-0 text-right text-xs text-gray-600">{d.people} people · {d.visits} visits</span>
                  </div>
                ))}
                {data.by_day.length === 0 && <div className="text-sm text-gray-500">No data yet.</div>}
              </div>
              <h3 className="pt-3 text-sm font-bold text-[#0A2B6B]">By hour of day</h3>
              <div className="flex items-end gap-0.5 h-24">
                {hours.map((v, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}:00 · ${v} visits`}>
                    <div className="w-full rounded-t bg-[#1F5BB5]" style={{ height: `${maxHour ? (v / maxHour) * 100 : 0}%`, minHeight: v ? 2 : 0 }} />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-500"><span>0</span><span>6</span><span>12</span><span>18</span><span>23</span></div>
            </Section>

            <Section title="Most opened places" hint="Clicks = call, WhatsApp, website, navigate, share and save">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 text-xs"><th className="text-left font-normal">Place</th><th className="font-normal">Opens</th><th className="font-normal">People</th><th className="font-normal">Clicks</th></tr></thead>
                <tbody>
                  {data.places.slice(0, 30).map((pl) => (
                    <tr key={pl.place_id} className="border-t">
                      <td className="py-1">
                        <a href={`/place/${pl.place_id}`} target="_blank" rel="noreferrer" className="text-[#1F5BB5] hover:underline" dir="auto">{pl.name || "Place"}</a>
                        {pl.category ? <span className="text-xs text-gray-500"> · {categoryLabel(pl.category)}</span> : null}
                      </td>
                      <td className="text-center">{pl.opens}</td><td className="text-center">{pl.people}</td><td className="text-center">{pl.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="What they did">
              <table className="w-full text-sm">
                <thead><tr className="text-gray-500 text-xs"><th className="text-left font-normal">Action</th><th className="font-normal">Times</th><th className="font-normal">People</th></tr></thead>
                <tbody>
                  {data.events.map((ev) => (
                    <tr key={ev.event} className="border-t"><td className="py-1">{eventLabel(ev.event)}</td><td className="text-center">{ev.count}</td><td className="text-center">{ev.people}</td></tr>
                  ))}
                </tbody>
              </table>
              <h3 className="pt-3 text-sm font-bold text-[#0A2B6B]">All searches</h3>
              <div className="flex flex-wrap gap-1.5">
                {data.searches.map((s) => (
                  <span key={s.q} className="rounded-full border bg-gray-50 px-2 py-0.5 text-sm" dir="auto">{s.q} <span className="text-gray-500">×{s.count}</span></span>
                ))}
                {data.searches.length === 0 && <span className="text-sm text-gray-500">No searches.</span>}
              </div>
            </Section>
          </div>

          <Section title="People" hint="Click a row to open that person's actions below">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left font-normal">Who</th><th className="text-left font-normal">First seen</th><th className="text-left font-normal">Last seen</th>
                    <th className="font-normal">Visits</th><th className="font-normal">Places</th><th className="font-normal">Call/web/nav</th>
                    <th className="font-normal">Actions</th><th className="text-left font-normal">Source</th><th className="text-left font-normal">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {data.people.map((pr) => (
                    <tr key={pr.person} onClick={() => jumpToPerson(pr.person)}
                      className={`border-t cursor-pointer hover:bg-blue-50 ${openPeople.has(pr.person) ? "bg-blue-50" : ""}`}>
                      <td className="py-1">
                        <span className="font-semibold" dir="auto">{who(pr.person)}</span>
                        {!pr.person.startsWith("v:") && data.users[pr.person]?.email && data.users[pr.person]?.name
                          ? <span className="block text-xs text-gray-500">{data.users[pr.person].email}</span> : null}
                      </td>
                      <td className="text-xs">{when(pr.first_seen)}</td><td className="text-xs">{when(pr.last_seen)}</td>
                      <td className="text-center">{pr.visits}</td><td className="text-center">{pr.place_opens}</td>
                      <td className="text-center">{pr.contact_clicks}</td><td className="text-center">{pr.events}</td>
                      <td className="text-xs" dir="auto">{srcLabel(pr.src)}</td>
                      <td className="text-xs">{pr.device === "mobile" ? "Phone" : pr.device === "desktop" ? "Computer" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Recent actions" hint="Most recently active first; click a person to open or close their actions"
            right={recentGroups.length ? (
              <button className="text-xs text-[#1F5BB5] underline"
                onClick={() => setOpenPeople(allOpen ? new Set() : new Set(recentGroups.map((g) => g.person)))}>
                {allOpen ? "Close all" : "Open all"}
              </button>
            ) : null}>
            <div className="divide-y text-sm">
              {recentGroups.map(({ person, actions }) => {
                const open = openPeople.has(person);
                return (
                  <div key={person} id={`actions-${person}`} className="scroll-mt-4">
                    <button onClick={() => togglePerson(person)}
                      className={`w-full py-2 flex items-center gap-2 text-left hover:bg-blue-50 ${open ? "bg-blue-50" : ""}`}>
                      <span className="w-4 text-gray-500">{open ? "▾" : "▸"}</span>
                      <span className="text-xs text-gray-500 w-24 shrink-0">{when(actions[0].at)}</span>
                      <span className="font-semibold" dir="auto">{who(person)}</span>
                      <span className="text-xs text-gray-500">· {actions.length} {actions.length === 1 ? "action" : "actions"}</span>
                    </button>
                    {open ? (
                      <ul className="pb-2 pl-6">
              {actions.map((r, i) => (
                <li key={`${r.at}-${i}`} className="py-1 flex flex-wrap gap-x-2 border-t border-gray-100">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{when(r.at)}</span>
                  <span>{eventLabel(r.event)}</span>
                  {r.meta?.name ? <span className="text-gray-600" dir="auto">· {r.meta.name}</span> : null}
                  {r.meta?.q ? <span className="text-gray-600" dir="auto">· &quot;{r.meta.q}&quot;{r.meta.results === 0 ? " (no results)" : ""}</span> : null}
                  {r.event === "filter_changed" && Array.isArray(r.meta?.labels) ? <span className="text-gray-600" dir="auto">· {r.meta?.label}: {(r.meta?.labels as string[]).join(", ")}</span> : null}
                  {r.event === "category_selected" && r.meta?.category ? <span className="text-gray-600">· {categoryLabel(r.meta.category)}</span> : null}
                  {r.event === "app_open" && (r.meta?.src || r.meta?.ref) ? <span className="text-gray-600" dir="auto">· from {r.meta.src || r.meta.ref}</span> : null}
                </li>
              ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
              {recentGroups.length === 0 && <div className="py-2 text-gray-500">No actions in this range.</div>}
            </div>
            {data.recent.length >= 200 ? <p className="text-xs text-gray-500">Showing the latest 200 actions.</p> : null}
          </Section>
        </>
      ) : null}
    </main>
  );
}
