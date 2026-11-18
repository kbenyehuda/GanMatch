"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

// "Today at a glance" for /admin/analytics: visitors, and the KPI that matters right now - NEW INFORMATION
// people add to the site. Every number says whether it counts PEOPLE or TIMES. Israel days; "today" is so far.

type Day = {
  people: number; signed_in: number; visits: number; opened: number; reviews: number; outbound: number;
  sources: { src: string; people: number }[];
};
type Win = { today: number; yesterday: number; week: number };
type Stat = { times: number; people: number };
type Actions = { real: Stat; saved: Stat; shared: Stat };
type TrendDay = { day: string; visitors: number; returning: number; review: number; place: number; edit: number; move: number; claim: number };

const STACK: { key: "review" | "place" | "edit" | "move" | "claim"; label: string; color: string }[] = [
  { key: "review", label: "Recommendations", color: "#1F5BB5" },
  { key: "place", label: "New places", color: "#16A34A" },
  { key: "edit", label: "Place edits", color: "#F59E0B" },
  { key: "move", label: "Pin moves", color: "#9333EA" },
  { key: "claim", label: "Owner claims", color: "#E11D48" },
];
const dayTotal = (d: TrendDay) => d.review + d.place + d.edit + d.move + d.claim;
const dayShort = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Compare the last 7 days with the 7 days before, in plain counts (no percentages: they mislead on tiny numbers). */
type Compared = { verdict: "early" | "up" | "down" | "flat"; text: string };
function compare(cur: number, prev: number, minPrev: number, decimals = 0): Compared {
  if (prev < minPrev) return { verdict: "early", text: "Collecting baseline" };
  const f = 10 ** decimals;
  const diff = Math.round((cur - prev) * f) / f;
  if (diff > 0) return { verdict: "up", text: `Up by ${diff}` };
  if (diff < 0) return { verdict: "down", text: `Down by ${Math.abs(diff)}` };
  return { verdict: "flat", text: "Same as before" };
}

function Verdict({ v }: { v: Compared }) {
  const cls = v.verdict === "up" ? "bg-emerald-100 text-emerald-800" : v.verdict === "down" ? "bg-rose-100 text-rose-800"
    : v.verdict === "flat" ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-800";
  const arrow = v.verdict === "up" ? "▲ " : v.verdict === "down" ? "▼ " : "";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{arrow}{v.text}</span>;
}

/** Bars per day; `parts` are stacked segments (one colour each). */
function DayBars({ days, parts, max, marks }: { days: TrendDay[]; parts: (d: TrendDay) => { value: number; color: string }[]; max: number; marks?: Record<string, string> }) {
  const H = 110;
  return (
    <div className="flex items-end gap-1" style={{ height: H + 34 }}>
      {days.map((d) => {
        const segs = parts(d);
        const total = segs.reduce((n, s) => n + s.value, 0);
        return (
          <div key={d.day} className="flex flex-1 flex-col items-center justify-end min-w-0" title={`${d.day}: ${total}`}>
            <span className="text-[10px] text-gray-600 h-4">{total || ""}</span>
            <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: max ? (total / max) * H : 0, minHeight: total ? 3 : 0 }}>
              {segs.filter((s) => s.value > 0).map((s, i) => (
                <div key={i} style={{ height: `${(s.value / total) * 100}%`, background: s.color }} />
              ))}
            </div>
            <span className="mt-1 text-[10px] text-gray-500 h-4">{dayShort(d.day)}</span>
            <span className="text-[9px] font-semibold text-amber-600 h-3 leading-3">{marks?.[d.day] ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The second KPI: did the map solve a real-world need? Counts PEOPLE (times in small print). */
function UsefulActions({ data }: { data: Overview }) {
  const a = data.actions;
  if (!a) return null;
  const rows: { label: string; key: keyof Actions; hint: string }[] = [
    { label: "Real-world actions (call, website, navigate)", key: "real", hint: "The map helped someone reach a place" },
    { label: "Places saved for later", key: "saved", hint: "Added to favorites" },
    { label: "Places shared with others", key: "shared", hint: "Sent to someone else: your best free growth" },
  ];
  const rate = (p: number, total: number) => (total ? `${p} of ${total} visitors (${Math.round((p / total) * 100)}%)` : `${p} of ${total} visitors`);
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
      <h3 className="font-bold text-[#0A2B6B]">Is the map useful? (useful actions)</h3>
      <p className="text-xs text-gray-500">
        Different people who did it (the number of times is in small print). Small numbers: read the counts, not the percentages.
        WhatsApp isn&apos;t counted because places have no WhatsApp button yet (only a phone call).
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left font-semibold py-1"></th>
            <th className="text-right font-semibold">Today</th>
            <th className="text-right font-semibold">Yesterday</th>
            <th className="text-right font-semibold">Last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" title={r.hint}>
              <td className="py-1.5">{r.label}</td>
              {(["today", "yesterday", "week"] as const).map((w) => (
                <td key={w} className={`text-right ${w === "today" ? "font-semibold" : ""}`}>
                  {a[w][r.key].people}
                  <span className="ml-1 text-[11px] font-normal text-gray-400">({a[w][r.key].times}×)</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm text-gray-700">
        Visitors who took a real-world action: today <strong>{rate(a.today.real.people, data.today.people)}</strong>
        {" · "}last 7 days <strong>{rate(a.week.real.people, data.week?.people ?? 0)}</strong>
      </div>
    </div>
  );
}

/** Map coverage: a pin with no recommendation frustrates parents. Kids' places come first. */
function CoverageCard({ c }: { c?: Overview["coverage"] }) {
  if (!c) return null;
  const bar = (n: number, of: number, color: string) => (
    <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden">
      <div className="h-full rounded" style={{ width: `${of ? Math.max(n ? 2 : 0, (n / of) * 100) : 0}%`, background: color }} />
    </div>
  );
  const row = (label: string, n: number, of: number, color: string) => (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{n} of {of}{of ? <span className="ml-1 text-xs font-normal text-gray-500">({Math.round((n / of) * 100)}%)</span> : null}</span>
      </div>
      <div className="flex">{bar(n, of, color)}</div>
    </div>
  );
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <h3 className="font-bold text-[#0A2B6B]">Map coverage: places with a recommendation</h3>
      <p className="text-xs text-gray-500">A pin with no recommendation frustrates parents. Visible places only. Kids&apos; places (gan, daycare, afternoon care) come first.</p>
      {row("Kids' places with 1+ recommendation", c.kids_rec, c.kids, "#16A34A")}
      {row("All places with 1+ recommendation", c.all_rec, c.all, "#1F5BB5")}
    </div>
  );
}

function ReturningChart({ trend }: { trend: TrendDay[] }) {
  const max = Math.max(0, ...trend.map((d) => d.visitors));
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
      <h3 className="font-bold text-[#0A2B6B]">First-time visitors vs people who came back</h3>
      <p className="text-xs text-gray-500">
        &quot;Came back&quot; = opened the site on a later day than the first day we ever saw that browser. A new phone or browser counts as new.
      </p>
      <DayBars days={trend} max={max}
        parts={(d) => [{ value: Math.max(0, d.visitors - d.returning), color: "#1F5BB5" }, { value: d.returning, color: "#16A34A" }]} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#1F5BB5" }} />First time</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "#16A34A" }} />Came back</span>
      </div>
    </div>
  );
}

function Direction({ trend, returning }: { trend: TrendDay[]; returning?: { week: number; before: number } }) {
  const prev = trend.slice(0, 7);
  const cur = trend.slice(7);
  const sumOf = (a: TrendDay[], f: (d: TrendDay) => number) => a.reduce((n, d) => n + f(d), 0);
  const vis = { cur: sumOf(cur, (d) => d.visitors), prev: sumOf(prev, (d) => d.visitors) };
  const info = { cur: sumOf(cur, dayTotal), prev: sumOf(prev, dayTotal) };
  const rate = {
    cur: vis.cur ? (info.cur / vis.cur) * 100 : 0,
    prev: vis.prev ? (info.prev / vis.prev) * 100 : 0,
  };
  const rows = [
    { label: "Visitors (people per day, added up)", cur: String(vis.cur), prev: String(vis.prev), v: compare(vis.cur, vis.prev, 20) },
    { label: "New information (items)", cur: String(info.cur), prev: String(info.prev), v: compare(info.cur, info.prev, 5) },
    // A rate built from a handful of items is noise: only judge it when both weeks have real numbers
    { label: "New information per 100 visitors", cur: rate.cur.toFixed(1), prev: rate.prev.toFixed(1),
      v: info.prev < 5 || vis.prev < 20 ? compare(0, 0, 1) : compare(rate.cur, rate.prev, 0.1, 1) },
    ...(returning ? [{
      label: "People who came back (a later day than their first visit)",
      cur: String(returning.week), prev: String(returning.before), v: compare(returning.week, returning.before, 5),
    }] : []),
  ];
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
      <h3 className="font-bold text-[#0A2B6B]">Are we heading in the right direction?</h3>
      <p className="text-xs text-gray-500">
        Last 7 days compared with the 7 days before, in plain counts. It says &quot;Collecting baseline&quot; until the earlier week has enough data
        (a launch week looks very different from a normal one). The best sign is more new information per 100 visitors.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-left font-semibold py-1"></th>
            <th className="text-right font-semibold">Last 7 days</th>
            <th className="text-right font-semibold">Before</th>
            <th className="text-right font-semibold pl-3">Direction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="py-1.5">{r.label}</td>
              <td className="text-right font-semibold">{r.cur}</td>
              <td className="text-right">{r.prev}</td>
              <td className="text-right pl-3"><Verdict v={r.v} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCharts({ trend }: { trend: TrendDay[] }) {
  const maxVisitors = Math.max(0, ...trend.map((d) => d.visitors));
  const maxInfo = Math.max(0, ...trend.map(dayTotal));
  // Mark an obvious one-day spike (the WhatsApp launch) so a quiet day after it doesn't feel like a crash
  const peak = trend.reduce((a, d) => (d.visitors > a.visitors ? d : a), trend[0] ?? { day: "", visitors: 0 } as TrendDay);
  const others = trend.filter((d) => d.day !== peak.day);
  const avgOthers = others.length ? others.reduce((n, d) => n + d.visitors, 0) / others.length : 0;
  const marks: Record<string, string> = peak.visitors >= 30 && peak.visitors >= 5 * avgOthers ? { [peak.day]: "launch" } : {};
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
        <h3 className="font-bold text-[#0A2B6B]">Visitors per day</h3>
        <p className="text-xs text-gray-500">Different people who opened the site, last 14 days (Israel days).</p>
        <DayBars days={trend} max={maxVisitors} marks={marks} parts={(d) => [{ value: d.visitors, color: "#1F5BB5" }]} />
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
        <h3 className="font-bold text-[#0A2B6B]">New information per day</h3>
        <p className="text-xs text-gray-500">Items people added, by type. This is the bar we want to see growing.</p>
        <DayBars days={trend} max={maxInfo} marks={marks} parts={(d) => STACK.map((s) => ({ value: d[s.key], color: s.color }))} />
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
          {STACK.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
type Overview = {
  generated_at: string;
  today: Day;
  yesterday: Day;
  contributions: { review: Win; place: Win; claim: Win; edit: Win; move: Win };
  contributors: Win;
  actions: { today: Actions; yesterday: Actions; week: Actions };
  week: { people: number };
  returning: { week: number; before: number };
  coverage: { all: number; all_rec: number; kids: number; kids_rec: number };
  trend: TrendDay[];
  latest: { kind: "review" | "place" | "claim" | "edit" | "move"; label: string; at: string }[];
};

const KIND_LABEL: Record<string, string> = {
  review: "Recommendation", place: "New place", claim: "Owner claim", edit: "Place edit", move: "Pin move request",
};
const ROWS: { key: keyof Overview["contributions"]; label: string }[] = [
  { key: "review", label: "Recommendations" },
  { key: "place", label: "New places" },
  { key: "edit", label: "Place edits (details)" },
  { key: "move", label: "Pin move requests" },
  { key: "claim", label: "Owner claims" },
];
const TZ = "Asia/Jerusalem";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const srcLabel = (s: string | null) => (!s || s === "ישיר" ? "Direct" : s);
const sum = (c: Overview["contributions"], k: keyof Win) => ROWS.reduce((n, r) => n + c[r.key][k], 0);

function Big({ label, today, yesterday, hint }: { label: string; today: number; yesterday: number; hint: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[#0A2B6B]">{today}</span>
        <span className="text-xs text-gray-500">today so far</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">Yesterday (full day): <strong>{yesterday}</strong></div>
      <div className="mt-1 text-[11px] text-gray-400">{hint}</div>
    </div>
  );
}

export default function NewInfoOverview() {
  const { user } = useSession();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true);
    setError(null);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error("Missing access token");
      const res = await fetch("/api/admin/analytics/overview", { headers: { authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : "Failed to load");
      setData(json as Overview);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[#0A2B6B]/15 bg-[#F6F9FF] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-[#0A2B6B]">Today at a glance</h2>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>Israel time · &quot;today&quot; = since midnight</span>
          <button className="px-2.5 py-1 rounded border bg-white text-sm text-gray-700" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
      {!data && !error ? <div className="text-sm text-gray-500">Loading...</div> : null}

      {data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Big label="Visitors (people)" today={data.today.people} yesterday={data.yesterday.people}
              hint="Different people who opened the site" />
            <Big label="Signed in (people)" today={data.today.signed_in} yesterday={data.yesterday.signed_in}
              hint="People who logged in" />
            <Big label="Opened a place (visits)" today={data.today.opened} yesterday={data.yesterday.opened}
              hint="Visits where someone opened a place" />
            <Big label="New information (items)" today={sum(data.contributions, "today")} yesterday={sum(data.contributions, "yesterday")}
              hint="Recommendations + places + edits + pin moves + owner claims" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
              <h3 className="font-bold text-[#0A2B6B]">New information people added</h3>
              <p className="text-xs text-gray-500">Counts items (not people). This is the number we want to grow.</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500">
                    <th className="text-left font-semibold py-1"></th>
                    <th className="text-right font-semibold">Today</th>
                    <th className="text-right font-semibold">Yesterday</th>
                    <th className="text-right font-semibold">Last 7 days</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="py-1">{r.label}</td>
                      <td className="text-right font-semibold">{data.contributions[r.key].today}</td>
                      <td className="text-right">{data.contributions[r.key].yesterday}</td>
                      <td className="text-right">{data.contributions[r.key].week}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-bold text-[#0A2B6B]">
                    <td className="py-1">Total</td>
                    <td className="text-right">{sum(data.contributions, "today")}</td>
                    <td className="text-right">{sum(data.contributions, "yesterday")}</td>
                    <td className="text-right">{sum(data.contributions, "week")}</td>
                  </tr>
                  <tr className="border-t text-gray-700">
                    <td className="py-1">People who contributed <span className="text-xs text-gray-400">(different people)</span></td>
                    <td className="text-right font-semibold">{data.contributors?.today ?? 0}</td>
                    <td className="text-right">{data.contributors?.yesterday ?? 0}</td>
                    <td className="text-right">{data.contributors?.week ?? 0}</td>
                  </tr>
                </tbody>
              </table>
              <h4 className="pt-2 text-sm font-bold text-[#0A2B6B]">Latest</h4>
              {data.latest.length === 0 ? <div className="text-sm text-gray-500">Nothing in the last 7 days.</div> : (
                <ul className="space-y-1 text-sm">
                  {data.latest.map((i, n) => (
                    <li key={n} className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate" dir="auto">
                        <span className="text-xs font-semibold text-gray-500">{KIND_LABEL[i.kind]}</span>{" "}{i.label}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">{when(i.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
              <h3 className="font-bold text-[#0A2B6B]">Where today&apos;s visitors came from</h3>
              <p className="text-xs text-gray-500">People per source, from the link they used. &quot;Direct&quot; = no tag.</p>
              {data.today.sources.length === 0 ? <div className="text-sm text-gray-500">No visitors yet today.</div> : (
                <div className="space-y-1">
                  {data.today.sources.map((s) => {
                    const max = Math.max(1, ...data.today.sources.map((x) => x.people));
                    return (
                      <div key={s.src} className="flex items-center gap-2 text-sm">
                        <span className="w-28 shrink-0 truncate" dir="auto">{srcLabel(s.src)}</span>
                        <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden">
                          <div className="h-full rounded bg-[#1F5BB5]" style={{ width: `${Math.max(3, (s.people / max) * 100)}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs text-gray-600">{s.people} people</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <h4 className="pt-2 text-sm font-bold text-[#0A2B6B]">Yesterday</h4>
              <div className="text-sm text-gray-700">
                {data.yesterday.sources.length === 0 ? "No visitors." : data.yesterday.sources.map((s) => `${srcLabel(s.src)} ${s.people}`).join(" · ")}
              </div>
            </div>
          </div>
          <UsefulActions data={data} />
          <Direction trend={data.trend ?? []} returning={data.returning} />
          <TrendCharts trend={data.trend ?? []} />
          <div className="grid lg:grid-cols-2 gap-4">
            <ReturningChart trend={data.trend ?? []} />
            <CoverageCard c={data.coverage} />
          </div>
        </>
      ) : null}
    </section>
  );
}
