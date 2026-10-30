"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type Status = "not_asked" | "asked" | "given" | "refused";
type Action = "save" | "asked" | "given" | "refused";

type ConsentItem = {
  place_id: string;
  contact: string | null;
  status: Status;
  asked_at: string | null;
  answered_at: string | null;
  proof: string | null;
  places?: { name?: string | null; phone?: string[] | null; is_hidden?: boolean | null; rec_count?: number | null } | null;
};

const STATUS_LABELS: Record<Status, string> = {
  not_asked: "עוד לא ביקשנו",
  asked: "ביקשנו, מחכים לתשובה",
  given: "הסכימה, מוצגת באתר",
  refused: "סירבה, מוסתרת",
};

const STATUS_COLORS: Record<Status, string> = {
  not_asked: "bg-gray-100 text-gray-700",
  asked: "bg-amber-100 text-amber-800",
  given: "bg-emerald-100 text-emerald-800",
  refused: "bg-rose-100 text-rose-800",
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : null);

// Private people (babysitters, caregivers) stay hidden until they agree to be listed.
// The proof stays in the email or screenshot; this page records who, how to reach them, and the answer.
export default function AdminConsentsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<ConsentItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { contact: string; proof: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);

  const token = useCallback(async () => {
    const t = await supabase?.auth.getSession().then((r) => r.data.session?.access_token ?? null);
    if (!t) throw new Error("Missing access token");
    return t;
  }, []);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/consents", { headers: { authorization: `Bearer ${await token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load");
      const list: ConsentItem[] = Array.isArray(data?.items) ? data.items : [];
      setItems(list);
      setDrafts(Object.fromEntries(list.map((i) => [i.place_id, { contact: i.contact ?? "", proof: i.proof ?? "" }])));
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load");
    } finally {
      setReloading(false);
    }
  }, [user, token]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const decide = useCallback(async (placeId: string, action: Action) => {
    const draft = drafts[placeId] ?? { contact: "", proof: "" };
    if (action === "given" && !draft.proof.trim()) {
      setError("לפני שמציגים באתר, כתבו איפה ההסכמה שמורה (למשל: Gmail, תווית הסכמות).");
      return;
    }
    setBusyId(placeId);
    setError(null);
    try {
      const res = await fetch("/api/admin/consents", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ place_id: placeId, action, contact: draft.contact, proof: draft.proof }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Decision failed");
      await load();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Decision failed");
    } finally {
      setBusyId(null);
    }
  }, [drafts, token, load]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  const waiting = items.filter((i) => i.status !== "given").length;

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 space-y-4 font-hebrew" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">הסכמות להופיע באתר</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">חזרה לאתר</a>
      </div>
      <p className="text-sm text-gray-600">
        אנשים פרטיים (בייביסיטרים, מטפלות) מוסתרים מהאתר עד שהם מסכימים. ההסכמה עצמה נשארת במייל או בצילום מסך,
        וכאן רושמים איך יוצרים קשר, מה ענו, ואיפה ההוכחה שמורה. פרטי הקשר כאן פרטיים ולא מוצגים באתר.
      </p>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={load} disabled={reloading}>
          {reloading ? "מרענן..." : "רענון"}
        </button>
        <span className="text-sm text-gray-600">ממתינים להסכמה: {waiting} מתוך {items.length}</span>
      </div>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="space-y-3">
        {items.map((item) => {
          const draft = drafts[item.place_id] ?? { contact: "", proof: "" };
          const setDraft = (patch: Partial<typeof draft>) =>
            setDrafts((prev) => ({ ...prev, [item.place_id]: { ...draft, ...patch } }));
          const busy = busyId === item.place_id;
          return (
            <section key={item.place_id} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-base text-[#0A2B6B]">{item.places?.name || "מקום"}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[item.status]}`}>{STATUS_LABELS[item.status]}</span>
              </div>
              <div className="text-xs text-gray-500">
                {item.places?.rec_count ? `${item.places.rec_count} המלצות` : "אין המלצות"}
                {item.places?.phone?.[0] ? ` · טלפון ברשומה: ${item.places.phone[0]}` : ""}
                {item.asked_at ? ` · ביקשנו ב-${day(item.asked_at)}` : ""}
                {item.answered_at ? ` · ענתה ב-${day(item.answered_at)}` : ""}
              </div>
              <label className="block text-sm">
                <span className="font-semibold">איך יוצרים קשר</span>
                <input value={draft.contact} onChange={(e) => setDraft({ contact: e.target.value })}
                  placeholder="מייל או טלפון" dir="auto"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
              </label>
              <label className="block text-sm">
                <span className="font-semibold">איפה ההוכחה</span>
                <input value={draft.proof} onChange={(e) => setDraft({ proof: e.target.value })}
                  placeholder="למשל: Gmail, תווית הסכמות / צילום מסך בדרייב"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
              </label>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button className="px-3 py-1.5 rounded border bg-white text-sm disabled:opacity-60" disabled={busy} onClick={() => decide(item.place_id, "save")}>
                  שמירה
                </button>
                {item.status !== "given" && (
                  <button className="px-3 py-1.5 rounded bg-amber-500 text-white text-sm disabled:opacity-60" disabled={busy} onClick={() => decide(item.place_id, "asked")}>
                    ביקשנו
                  </button>
                )}
                {item.status !== "given" && (
                  <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60" disabled={busy} onClick={() => decide(item.place_id, "given")}>
                    הסכימה, להציג באתר
                  </button>
                )}
                <button className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60" disabled={busy} onClick={() => decide(item.place_id, "refused")}>
                  {item.status === "given" ? "ביטלה הסכמה, להסתיר" : "סירבה"}
                </button>
              </div>
            </section>
          );
        })}
        {items.length === 0 && !reloading && <div className="text-sm text-gray-500">אין אנשים שממתינים להסכמה.</div>}
      </div>
    </main>
  );
}
