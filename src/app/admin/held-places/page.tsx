"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { PLACE_HOLD_LABELS, type PlaceHoldReason } from "@/lib/place-hold-reasons";

type HeldPlace = {
  id: string;
  name: string;
  place_category: string | null;
  address: string | null;
  description: string | null;
  phone: string[] | null;
  website: string | null;
  hours: string | null;
  created_at: string;
  reasons: string[];
};

const CATEGORY_HE: Record<string, string> = {
  kids: "ילדים", doctor: "רופאים", clinic: "מרפאות", cosmetics: "יופי וטיפוח", cafe: "בתי קפה", sport: "ספורט", attraction: "אטרקציות", food: "אוכל",
};

// New places the automatic check saved hidden (offensive, contact/ad text, not a real place, or the check was down).
// Approve shows the place on the map. Reject keeps it hidden: nothing is deleted.
export default function AdminHeldPlacesPage() {
  const { user, loading } = useSession();
  const [items, setItems] = useState<HeldPlace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // ?id=<place> (the link in the admin email) shows just that place.
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
      const res = await fetch("/api/admin/held-places", { headers: { authorization: `Bearer ${await token()}` } });
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

  const decide = useCallback(async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/held-places", {
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
        <h1 className="text-2xl font-bold">מקומות חדשים ממתינים</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">חזרה לאתר</a>
      </div>
      <p className="text-sm text-gray-600">
        מקומות שנוספו על ידי גולשים והבדיקה האוטומטית עצרה אותם. אישור מציג את המקום על המפה. דחייה משאירה אותו מוסתר (שום דבר לא נמחק).
      </p>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={load} disabled={reloading}>
          {reloading ? "מרענן..." : "רענון"}
        </button>
        <span className="text-sm text-gray-600">ממתינים: {items.length}</span>
      </div>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {focusId && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-blue-50 px-3 py-2 text-sm">
          <span>מוצג מקום אחד מהמייל</span>
          <button className="px-3 py-1.5 rounded border bg-white text-sm" onClick={() => { setFocusId(null); window.history.replaceState(null, "", window.location.pathname); }}>
            לכל המקומות הממתינים
          </button>
        </div>
      )}
      <div className="space-y-3">
        {shown.map((item) => (
          <section key={item.id} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-base text-[#0A2B6B]">{item.name}</span>
              <span className="text-xs text-gray-500">
                {item.place_category ? `${CATEGORY_HE[item.place_category] ?? item.place_category} · ` : ""}
                {new Date(item.created_at).toLocaleString("he-IL")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {item.reasons.map((r) => (
                <span key={r} className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {PLACE_HOLD_LABELS[r as PlaceHoldReason] ?? r}
                </span>
              ))}
            </div>
            {item.description ? <p className="text-sm leading-relaxed text-gray-800">&ldquo;{item.description}&rdquo;</p> : <p className="text-sm text-gray-400">(ללא תיאור)</p>}
            <div className="text-sm text-gray-700 space-y-0.5">
              {item.address ? <div><strong>כתובת:</strong> {item.address}</div> : null}
              {item.phone?.length ? <div><strong>טלפון:</strong> {item.phone.join(", ")}</div> : null}
              {item.website ? <div dir="ltr" className="text-start"><strong dir="rtl">אתר:</strong> {item.website}</div> : null}
              {item.hours ? <div><strong>שעות:</strong> {item.hours}</div> : null}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                disabled={busyId === item.id} onClick={() => decide(item.id, "approve")}>
                אישור והצגה על המפה
              </button>
              <button className="px-3 py-1.5 rounded bg-gray-600 text-white text-sm disabled:opacity-60"
                disabled={busyId === item.id} onClick={() => decide(item.id, "reject")}>
                דחייה (נשאר מוסתר)
              </button>
            </div>
          </section>
        ))}
        {shown.length === 0 && !reloading && <div className="text-sm text-gray-500">אין מקומות ממתינים.</div>}
      </div>
    </main>
  );
}
