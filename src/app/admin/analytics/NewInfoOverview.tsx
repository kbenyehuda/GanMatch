"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

// "Today at a glance" for /admin/analytics: visitors, and the KPI that matters right now - NEW INFORMATION
// people add to the site. Every number says whether it counts PEOPLE or TIMES. Israel days; "today" is so far.
// English by default with an English / עברית switch (decision 2026-11-18). Hebrew is right-to-left; the charts
// keep time running left to right.

export type Lang = "en" | "he";
const LangCtx = createContext<Lang>("en");

const HE: Record<string, string> = {
  "Today at a glance": "היום במבט אחד",
  "Israel time · \"today\" = since midnight": "שעון ישראל · \"היום\" = מאז חצות",
  "Refresh": "רענון", "Refreshing...": "מרענן...", "Loading...": "טוען...",
  "Visitors (people)": "מבקרים (אנשים)", "Signed in (people)": "מחוברים (אנשים)",
  "Opened a place (visits)": "פתחו מקום (ביקורים)", "New information (items)": "מידע חדש (פריטים)",
  "Different people who opened the site": "אנשים שונים שנכנסו לאתר", "People who logged in": "אנשים שהתחברו",
  "Visits where someone opened a place": "ביקורים שבהם נפתח מקום",
  "Recommendations + places + edits + pin moves + owner claims": "המלצות + מקומות + עריכות + הזזות סיכה + בקשות בעלות",
  "today so far": "היום עד עכשיו", "Yesterday (full day)": "אתמול (יום שלם)",
  "Today": "היום", "Yesterday": "אתמול", "Last 7 days": "7 הימים האחרונים", "Before": "לפני", "Direction": "כיוון",
  "New information people added": "מידע חדש שאנשים הוסיפו",
  "Counts items (not people). This is the number we want to grow.": "סופר פריטים (לא אנשים). זה המספר שרוצים להגדיל.",
  "Recommendations": "המלצות", "New places": "מקומות חדשים", "Place edits (details)": "עריכות של מקומות (פרטים)",
  "Pin move requests": "בקשות הזזת סיכה", "Owner claims": "בקשות בעלות", "Place edits": "עריכות מקומות", "Pin moves": "הזזות סיכה",
  "Total": "סה״כ", "People who contributed": "אנשים שתרמו", "(different people)": "(אנשים שונים)",
  "Latest": "אחרונים", "Nothing in the last 7 days.": "אין כלום ב-7 הימים האחרונים.",
  "Recommendation": "המלצה", "New place": "מקום חדש", "Owner claim": "בקשת בעלות", "Place edit": "עריכת מקום", "Pin move request": "בקשת הזזת סיכה",
  "Where today's visitors came from": "מאיפה הגיעו המבקרים היום",
  "People per source, from the link they used. \"Direct\" = no tag.": "אנשים לפי מקור, לפי הקישור שבו השתמשו. \"ישיר\" = בלי תג.",
  "No visitors yet today.": "אין עדיין מבקרים היום.", "No visitors.": "אין מבקרים.", "people": "אנשים", "Direct": "ישיר",
  "Is the map useful? (useful actions)": "האם המפה מועילה? (פעולות מועילות)",
  "Different people who did it (the number of times is in small print). Small numbers: read the counts, not the percentages. WhatsApp is counted only for places with a mobile number.":
    "אנשים שונים שעשו זאת (מספר הפעמים באותיות קטנות). מספרים קטנים: מסתכלים על הכמות, לא על האחוזים. וואטסאפ נספר רק במקומות עם מספר נייד.",
  "Real-world actions (call, website, navigate, WhatsApp)": "פעולות בעולם האמיתי (חיוג, אתר, ניווט, וואטסאפ)",
  "The map helped someone reach a place": "המפה עזרה למישהו להגיע למקום", "Places saved for later": "מקומות שנשמרו למועדפים",
  "Added to favorites": "נוסף למועדפים", "Places shared with others": "מקומות ששיתפו עם אחרים",
  "Sent to someone else: your best free growth": "נשלח למישהו אחר: הצמיחה החינמית הכי טובה",
  "Visitors who took a real-world action:": "מבקרים שעשו פעולה אמיתית:", "today": "היום", "last 7 days": "7 הימים האחרונים",
  "of": "מתוך", "visitors": "מבקרים",
  "Are we heading in the right direction?": "האם אנחנו בכיוון הנכון?",
  "Last 7 days compared with the 7 days before, in plain counts. It says \"Collecting baseline\" until the earlier week has enough data (a launch week looks very different from a normal one). The best sign is more new information per 100 visitors.":
    "7 הימים האחרונים מול 7 הימים שלפניהם, בכמויות פשוטות. כתוב \"אוספים נתוני בסיס\" עד שבשבוע הקודם יש מספיק נתונים (שבוע השקה שונה מאוד משבוע רגיל). הסימן הטוב ביותר הוא יותר מידע חדש לכל 100 מבקרים.",
  "Visitors (people per day, added up)": "מבקרים (אנשים ליום, מסוכם)",
  "New information per 100 visitors": "מידע חדש ל-100 מבקרים",
  "People who came back (a later day than their first visit)": "אנשים שחזרו (ביום מאוחר מהביקור הראשון)",
  "Collecting baseline": "אוספים נתוני בסיס", "Up by": "עלייה של", "Down by": "ירידה של", "Same as before": "כמו קודם",
  "Visitors per day": "מבקרים ליום",
  "Different people who opened the site, last 14 days (Israel days).": "אנשים שונים שנכנסו לאתר, 14 הימים האחרונים (ימי ישראל).",
  "New information per day": "מידע חדש ליום",
  "Items people added, by type. This is the bar we want to see growing.": "פריטים שאנשים הוסיפו, לפי סוג. זה העמוד שרוצים לראות גדל.",
  "launch": "השקה",
  "First-time visitors vs people who came back": "מבקרים חדשים מול אנשים שחזרו",
  "\"Came back\" = opened the site on a later day than the first day we ever saw that browser. A new phone or browser counts as new.":
    "\"חזרו\" = נכנסו לאתר ביום מאוחר מהיום הראשון שבו ראינו את הדפדפן. טלפון או דפדפן חדש נחשב כחדש.",
  "First time": "פעם ראשונה", "Came back": "חזרו",
  "Map coverage: places with a recommendation": "כיסוי המפה: מקומות עם המלצה",
  "A pin with no recommendation frustrates parents. Visible places only. Kids' places (gan, daycare, afternoon care) come first.":
    "סיכה בלי המלצה מתסכלת הורים. רק מקומות גלויים. מקומות לילדים (גנים, משפחתונים, צהרונים) קודמים.",
  "Kids' places with 1+ recommendation": "מקומות לילדים עם המלצה אחת או יותר",
  "All places with 1+ recommendation": "כל המקומות עם המלצה אחת או יותר",
};

/** The translator for the current language: English text is the key; unknown keys fall back to English. */
function useT() {
  const lang = useContext(LangCtx);
  return (s: string) => (lang === "he" ? HE[s] ?? s : s);
}

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
type Compared = { verdict: "early" | "up" | "down" | "flat"; n: number };
function compare(cur: number, prev: number, minPrev: number, decimals = 0): Compared {
  if (prev < minPrev) return { verdict: "early", n: 0 };
  const f = 10 ** decimals;
  const diff = Math.round((cur - prev) * f) / f;
  if (diff > 0) return { verdict: "up", n: diff };
  if (diff < 0) return { verdict: "down", n: Math.abs(diff) };
  return { verdict: "flat", n: 0 };
}

function Verdict({ v }: { v: Compared }) {
  const t = useT();
  const cls = v.verdict === "up" ? "bg-emerald-100 text-emerald-800" : v.verdict === "down" ? "bg-rose-100 text-rose-800"
    : v.verdict === "flat" ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-800";
  const text = v.verdict === "up" ? `▲ ${t("Up by")} ${v.n}` : v.verdict === "down" ? `▼ ${t("Down by")} ${v.n}`
    : v.verdict === "flat" ? t("Same as before") : t("Collecting baseline");
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{text}</span>;
}

/** Bars per day; `parts` are stacked segments (one colour each). Time always runs left to right. */
function DayBars({ days, parts, max, marks }: { days: TrendDay[]; parts: (d: TrendDay) => { value: number; color: string }[]; max: number; marks?: Record<string, string> }) {
  const H = 110;
  return (
    <div dir="ltr" className="flex items-end gap-1" style={{ height: H + 34 }}>
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

const Legend = ({ items }: { items: { label: string; color: string }[] }) => {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
      {items.map((s) => (
        <span key={s.label} className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{t(s.label)}
        </span>
      ))}
    </div>
  );
};

/** The second KPI: did the map solve a real-world need? Counts PEOPLE (times in small print). */
function UsefulActions({ data }: { data: Overview }) {
  const t = useT();
  const a = data.actions;
  if (!a) return null;
  const rows: { label: string; key: keyof Actions; hint: string }[] = [
    { label: "Real-world actions (call, website, navigate, WhatsApp)", key: "real", hint: "The map helped someone reach a place" },
    { label: "Places saved for later", key: "saved", hint: "Added to favorites" },
    { label: "Places shared with others", key: "shared", hint: "Sent to someone else: your best free growth" },
  ];
  const rate = (p: number, total: number) =>
    `${p} ${t("of")} ${total} ${t("visitors")}${total ? ` (${Math.round((p / total) * 100)}%)` : ""}`;
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
      <h3 className="font-bold text-[#0A2B6B]">{t("Is the map useful? (useful actions)")}</h3>
      <p className="text-xs text-gray-500">
        {t("Different people who did it (the number of times is in small print). Small numbers: read the counts, not the percentages. WhatsApp is counted only for places with a mobile number.")}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-start font-semibold py-1"></th>
            <th className="text-end font-semibold">{t("Today")}</th>
            <th className="text-end font-semibold">{t("Yesterday")}</th>
            <th className="text-end font-semibold">{t("Last 7 days")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t" title={t(r.hint)}>
              <td className="py-1.5">{t(r.label)}</td>
              {(["today", "yesterday", "week"] as const).map((w) => (
                <td key={w} className={`text-end ${w === "today" ? "font-semibold" : ""}`}>
                  {a[w][r.key].people}
                  <span className="ms-1 text-[11px] font-normal text-gray-400">({a[w][r.key].times}×)</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-sm text-gray-700">
        {t("Visitors who took a real-world action:")} {t("today")} <strong>{rate(a.today.real.people, data.today.people)}</strong>
        {" · "}{t("last 7 days")} <strong>{rate(a.week.real.people, data.week?.people ?? 0)}</strong>
      </div>
    </div>
  );
}

/** Map coverage: a pin with no recommendation frustrates parents. Kids' places come first. */
function CoverageCard({ c }: { c?: Overview["coverage"] }) {
  const t = useT();
  if (!c) return null;
  const bar = (n: number, of: number, color: string) => (
    <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden">
      <div className="h-full rounded" style={{ width: `${of ? Math.max(n ? 2 : 0, (n / of) * 100) : 0}%`, background: color }} />
    </div>
  );
  const row = (label: string, n: number, of: number, color: string) => (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-sm">
        <span>{t(label)}</span>
        <span className="font-semibold">{n} {t("of")} {of}{of ? <span className="ms-1 text-xs font-normal text-gray-500">({Math.round((n / of) * 100)}%)</span> : null}</span>
      </div>
      <div className="flex">{bar(n, of, color)}</div>
    </div>
  );
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-3">
      <h3 className="font-bold text-[#0A2B6B]">{t("Map coverage: places with a recommendation")}</h3>
      <p className="text-xs text-gray-500">{t("A pin with no recommendation frustrates parents. Visible places only. Kids' places (gan, daycare, afternoon care) come first.")}</p>
      {row("Kids' places with 1+ recommendation", c.kids_rec, c.kids, "#16A34A")}
      {row("All places with 1+ recommendation", c.all_rec, c.all, "#1F5BB5")}
    </div>
  );
}

function ReturningChart({ trend }: { trend: TrendDay[] }) {
  const t = useT();
  const max = Math.max(0, ...trend.map((d) => d.visitors));
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
      <h3 className="font-bold text-[#0A2B6B]">{t("First-time visitors vs people who came back")}</h3>
      <p className="text-xs text-gray-500">
        {t("\"Came back\" = opened the site on a later day than the first day we ever saw that browser. A new phone or browser counts as new.")}
      </p>
      <DayBars days={trend} max={max}
        parts={(d) => [{ value: Math.max(0, d.visitors - d.returning), color: "#1F5BB5" }, { value: d.returning, color: "#16A34A" }]} />
      <Legend items={[{ label: "First time", color: "#1F5BB5" }, { label: "Came back", color: "#16A34A" }]} />
    </div>
  );
}

function Direction({ trend, returning }: { trend: TrendDay[]; returning?: { week: number; before: number } }) {
  const t = useT();
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
      <h3 className="font-bold text-[#0A2B6B]">{t("Are we heading in the right direction?")}</h3>
      <p className="text-xs text-gray-500">
        {t("Last 7 days compared with the 7 days before, in plain counts. It says \"Collecting baseline\" until the earlier week has enough data (a launch week looks very different from a normal one). The best sign is more new information per 100 visitors.")}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="text-start font-semibold py-1"></th>
            <th className="text-end font-semibold">{t("Last 7 days")}</th>
            <th className="text-end font-semibold">{t("Before")}</th>
            <th className="text-end font-semibold ps-3">{t("Direction")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t">
              <td className="py-1.5">{t(r.label)}</td>
              <td className="text-end font-semibold">{r.cur}</td>
              <td className="text-end">{r.prev}</td>
              <td className="text-end ps-3"><Verdict v={r.v} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCharts({ trend }: { trend: TrendDay[] }) {
  const t = useT();
  const maxVisitors = Math.max(0, ...trend.map((d) => d.visitors));
  const maxInfo = Math.max(0, ...trend.map(dayTotal));
  // Mark an obvious one-day spike (the WhatsApp launch) so a quiet day after it doesn't feel like a crash
  const peak = trend.reduce((a, d) => (d.visitors > a.visitors ? d : a), trend[0] ?? { day: "", visitors: 0 } as TrendDay);
  const others = trend.filter((d) => d.day !== peak.day);
  const avgOthers = others.length ? others.reduce((n, d) => n + d.visitors, 0) / others.length : 0;
  const marks: Record<string, string> = peak.visitors >= 30 && peak.visitors >= 5 * avgOthers ? { [peak.day]: t("launch") } : {};
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
        <h3 className="font-bold text-[#0A2B6B]">{t("Visitors per day")}</h3>
        <p className="text-xs text-gray-500">{t("Different people who opened the site, last 14 days (Israel days).")}</p>
        <DayBars days={trend} max={maxVisitors} marks={marks} parts={(d) => [{ value: d.visitors, color: "#1F5BB5" }]} />
      </div>
      <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
        <h3 className="font-bold text-[#0A2B6B]">{t("New information per day")}</h3>
        <p className="text-xs text-gray-500">{t("Items people added, by type. This is the bar we want to see growing.")}</p>
        <DayBars days={trend} max={maxInfo} marks={marks} parts={(d) => STACK.map((s) => ({ value: d[s.key], color: s.color }))} />
        <Legend items={STACK} />
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
const sum = (c: Overview["contributions"], k: keyof Win) => ROWS.reduce((n, r) => n + c[r.key][k], 0);

function Big({ label, today, yesterday, hint }: { label: string; today: number; yesterday: number; hint: string }) {
  const t = useT();
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-gray-500">{t(label)}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-[#0A2B6B]">{today}</span>
        <span className="text-xs text-gray-500">{t("today so far")}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">{t("Yesterday (full day)")}: <strong>{yesterday}</strong></div>
      <div className="mt-1 text-[11px] text-gray-400">{t(hint)}</div>
    </div>
  );
}

export type OverviewPart = "pulse" | "demand" | "community";

export default function NewInfoOverview({ part, lang, onLang }: { part: OverviewPart; lang: Lang; onLang: (l: Lang) => void }) {
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

  const t = (s: string) => (lang === "he" ? HE[s] ?? s : s);
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "he" ? "he-IL" : "en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const srcLabel = (s: string | null) => (!s || s === "ישיר" ? t("Direct") : s);

  return (
    <LangCtx.Provider value={lang}>
      <section dir={lang === "he" ? "rtl" : "ltr"} className="space-y-3 rounded-2xl border-2 border-[#0A2B6B]/15 bg-[#F6F9FF] p-4">
        {part === "pulse" ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-[#0A2B6B]">{t("Today at a glance")}</h2>
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>{t("Israel time · \"today\" = since midnight")}</span>
              <button className="px-2.5 py-1 rounded border bg-white text-sm text-gray-700" onClick={load} disabled={loading}>
                {loading ? t("Refreshing...") : t("Refresh")}
              </button>
            </div>
          </div>
        ) : null}
        {error ? <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}
        {!data && !error ? <div className="text-sm text-gray-500">{t("Loading...")}</div> : null}

        {data ? (
          <>
            {part === "pulse" ? (
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

              <div className="grid lg:grid-cols-1 gap-4">
              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                <h3 className="font-bold text-[#0A2B6B]">{t("Where today's visitors came from")}</h3>
                <p className="text-xs text-gray-500">{t("People per source, from the link they used. \"Direct\" = no tag.")}</p>
                {data.today.sources.length === 0 ? <div className="text-sm text-gray-500">{t("No visitors yet today.")}</div> : (
                  <div className="space-y-1">
                    {data.today.sources.map((s) => {
                      const max = Math.max(1, ...data.today.sources.map((x) => x.people));
                      return (
                        <div key={s.src} className="flex items-center gap-2 text-sm">
                          <span className="w-28 shrink-0 truncate" dir="auto">{srcLabel(s.src)}</span>
                          <div className="h-2.5 flex-1 rounded bg-gray-100 overflow-hidden">
                            <div className="h-full rounded bg-[#1F5BB5]" style={{ width: `${Math.max(3, (s.people / max) * 100)}%` }} />
                          </div>
                          <span className="w-20 shrink-0 text-end text-xs text-gray-600">{s.people} {t("people")}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <h4 className="pt-2 text-sm font-bold text-[#0A2B6B]">{t("Yesterday")}</h4>
                <div className="text-sm text-gray-700">
                  {data.yesterday.sources.length === 0 ? t("No visitors.") : data.yesterday.sources.map((s) => `${srcLabel(s.src)} ${s.people}`).join(" · ")}
                </div>
              </div>
            </div>
            <Direction trend={data.trend ?? []} returning={data.returning} />
            <TrendCharts trend={data.trend ?? []} />
            <ReturningChart trend={data.trend ?? []} />
              </>
            ) : null}
            {part === "demand" ? <>
            <UsefulActions data={data} />
            </> : null}
            {part === "community" ? (
              <>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-white p-4 shadow-sm space-y-2">
                <h3 className="font-bold text-[#0A2B6B]">{t("New information people added")}</h3>
                <p className="text-xs text-gray-500">{t("Counts items (not people). This is the number we want to grow.")}</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500">
                      <th className="text-start font-semibold py-1"></th>
                      <th className="text-end font-semibold">{t("Today")}</th>
                      <th className="text-end font-semibold">{t("Yesterday")}</th>
                      <th className="text-end font-semibold">{t("Last 7 days")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((r) => (
                      <tr key={r.key} className="border-t">
                        <td className="py-1">{t(r.label)}</td>
                        <td className="text-end font-semibold">{data.contributions[r.key].today}</td>
                        <td className="text-end">{data.contributions[r.key].yesterday}</td>
                        <td className="text-end">{data.contributions[r.key].week}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-bold text-[#0A2B6B]">
                      <td className="py-1">{t("Total")}</td>
                      <td className="text-end">{sum(data.contributions, "today")}</td>
                      <td className="text-end">{sum(data.contributions, "yesterday")}</td>
                      <td className="text-end">{sum(data.contributions, "week")}</td>
                    </tr>
                    <tr className="border-t text-gray-700">
                      <td className="py-1">{t("People who contributed")} <span className="text-xs text-gray-400">{t("(different people)")}</span></td>
                      <td className="text-end font-semibold">{data.contributors?.today ?? 0}</td>
                      <td className="text-end">{data.contributors?.yesterday ?? 0}</td>
                      <td className="text-end">{data.contributors?.week ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
                <h4 className="pt-2 text-sm font-bold text-[#0A2B6B]">{t("Latest")}</h4>
                {data.latest.length === 0 ? <div className="text-sm text-gray-500">{t("Nothing in the last 7 days.")}</div> : (
                  <ul className="space-y-1 text-sm">
                    {data.latest.map((i, n) => (
                      <li key={n} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate" dir="auto">
                          <span className="text-xs font-semibold text-gray-500">{t(KIND_LABEL[i.kind])}</span>{" "}{i.label}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">{when(i.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              </div>
            <CoverageCard c={data.coverage} />
              </>
            ) : null}
          </>
        ) : null}
      </section>
    </LangCtx.Provider>
  );
}
