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
type Overview = {
  generated_at: string;
  today: Day;
  yesterday: Day;
  contributions: { review: Win; place: Win; claim: Win; edit: Win; move: Win };
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
        </>
      ) : null}
    </section>
  );
}
