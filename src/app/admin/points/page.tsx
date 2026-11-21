"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type Row = {
  user_id: string; email: string | null; name: string | null; is_admin: boolean;
  points: number; pending: number; recommendations: number; newPlaces: number; detailEdits: number;
};

// Who earned the most points (for the raffle later). Points are counted from approved contributions only.
export default function AdminPointsPage() {
  const { user, loading } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hideAdmins, setHideAdmins] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setBusy(true);
    setError(null);
    try {
      const t = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
      if (!t) throw new Error("Missing access token");
      const res = await fetch("/api/admin/points", { headers: { authorization: `Bearer ${t}` }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load");
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  const shown = rows.filter((r) => !(hideAdmins && r.is_admin));
  return (
    <main className="mx-auto max-w-3xl p-4 md:p-6 space-y-4 font-hebrew" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">נקודות</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">חזרה לאתר</a>
      </div>
      <p className="text-sm text-gray-600">
        המלצה 5, מקום חדש 5, עדכון פרטים שאושר 3. עד 20 נקודות ביום לאדם. נקודות נספרות רק אחרי אישור.
        "בדרך" = מחכה לאישור.
      </p>
      <div className="flex items-center gap-3">
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={load} disabled={busy}>{busy ? "מרענן..." : "רענון"}</button>
        <label className="text-sm flex items-center gap-1">
          <input type="checkbox" checked={hideAdmins} onChange={(e) => setHideAdmins(e.target.checked)} /> בלי מנהלות
        </label>
      </div>
      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <div className="rounded-xl border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-2 text-start">#</th><th className="p-2 text-start">מי</th>
              <th className="p-2">נקודות</th><th className="p-2">בדרך</th>
              <th className="p-2">המלצות</th><th className="p-2">מקומות</th><th className="p-2">עדכונים</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.user_id} className="border-t">
                <td className="p-2">{i + 1}</td>
                <td className="p-2" dir="auto">{r.name ?? r.email ?? r.user_id.slice(0, 8)}{r.name && r.email ? <span className="text-gray-400"> · {r.email}</span> : null}</td>
                <td className="p-2 text-center font-bold">{r.points}</td>
                <td className="p-2 text-center text-gray-500">{r.pending || ""}</td>
                <td className="p-2 text-center">{r.recommendations}</td>
                <td className="p-2 text-center">{r.newPlaces}</td>
                <td className="p-2 text-center">{r.detailEdits}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="p-4 text-center text-gray-500">עוד אין נקודות</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
