"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { HOLD_REASON_LABELS, type HoldReason } from "@/lib/hold-reasons";

type HeldReview = {
  id: string;
  place_id: string;
  rating: number;
  text: string | null;
  hold_reasons: string[] | null;
  reviewer_public_name: string | null;
  created_at: string;
  places?: { name?: string | null; address?: string | null; place_category?: string | null } | null;
};

// Recommendations saved hidden: flagged by the automatic check, or rated 1–2. Approve to publish, or delete.
export default function AdminHeldReviewsPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<HeldReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // ?id=<review> (the link in the admin email) shows just that recommendation.
  const [focusId, setFocusId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id"));

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
      const res = await fetch("/api/admin/held-reviews", { headers: { authorization: `Bearer ${await token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load");
    } finally {
      setReloading(false);
    }
  }, [user, token]);

  useEffect(() => { if (user) load(); }, [user, load]);

  const decide = useCallback(async (id: string, action: "approve" | "delete") => {
    if (action === "delete" && !window.confirm("למחוק את ההמלצה לצמיתות?")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/held-reviews", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Decision failed");
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (focusId === id) setFocusId(null);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Decision failed");
    } finally {
      setBusyId(null);
    }
  }, [token, focusId]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  const shown = focusId ? items.filter((i) => i.id === focusId) : items;

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 space-y-4 font-hebrew" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">המלצות ממתינות</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">חזרה לאתר</a>
      </div>
      <p className="text-sm text-gray-600">
        המלצות שנשמרו מוסתרות: הבדיקה האוטומטית סימנה אותן, או שהדירוג הוא 1–2. אישור מפרסם אותה, מחיקה מוחקת לצמיתות.
      </p>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={load} disabled={reloading}>
          {reloading ? "מרענן..." : "רענון"}
        </button>
        <span className="text-sm text-gray-600">ממתינות: {items.length}</span>
      </div>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {focusId && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-blue-50 px-3 py-2 text-sm">
          <span>מוצגת המלצה אחת מהמייל</span>
          <button className="px-3 py-1.5 rounded border bg-white text-sm" onClick={() => { setFocusId(null); window.history.replaceState(null, "", window.location.pathname); }}>
            לכל ההמלצות הממתינות
          </button>
        </div>
      )}
      <div className="space-y-3">
        {shown.map((item) => (
          <section key={item.id} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={`/place/${item.place_id}`} target="_blank" rel="noreferrer" className="font-semibold text-base text-[#0A2B6B] underline">
                {item.places?.name || "מקום"}
              </a>
              <span className="text-xs text-gray-500">{new Date(item.created_at).toLocaleDateString("he-IL")}</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">דירוג:</span> {item.rating} מתוך 5
              {item.reviewer_public_name ? <span className="text-gray-500"> · {item.reviewer_public_name}</span> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {(item.hold_reasons ?? []).map((r) => (
                <span key={r} className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {HOLD_REASON_LABELS[r as HoldReason] ?? r}
                </span>
              ))}
            </div>
            {item.text ? <p className="text-sm leading-relaxed text-gray-800">&ldquo;{item.text}&rdquo;</p> : <p className="text-sm text-gray-400">(ללא טקסט)</p>}
            <div className="flex items-center gap-2 pt-1">
              <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                disabled={busyId === item.id} onClick={() => decide(item.id, "approve")}>
                אישור לפרסום
              </button>
              <button className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
                disabled={busyId === item.id} onClick={() => decide(item.id, "delete")}>
                מחיקה
              </button>
            </div>
          </section>
        ))}
        {shown.length === 0 && !reloading && <div className="text-sm text-gray-500">אין המלצות ממתינות.</div>}
      </div>
    </main>
  );
}
