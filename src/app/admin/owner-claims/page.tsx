"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type ClaimStatus = "pending" | "approved" | "declined" | "revoked";

type Claim = {
  id: string;
  place_id: string;
  full_name: string;
  role: string | null;
  phone: string;
  note: string | null;
  status: ClaimStatus;
  verification_note: string | null;
  created_at: string;
  decided_at: string | null;
  user_email: string | null;
  other_claims: { place: string; status: ClaimStatus }[];
  places?: { name?: string | null; address?: string | null; place_category?: string | null; phone?: string[] | null } | null;
};

const STATUS_HE: Record<ClaimStatus, string> = { pending: "ממתין", approved: "אושר", declined: "נדחה", revoked: "בוטל" };
const TABS: ClaimStatus[] = ["pending", "approved", "declined", "revoked"];

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL") : "-");

// "זה העסק שלכם?" requests (decisions 2026-11-07): call or WhatsApp the phone on the listing,
// then approve with a note on how you verified. No documents are kept.
export default function AdminOwnerClaimsPage() {
  const { user, loading } = useSession();
  const [status, setStatus] = useState<ClaimStatus>("pending");
  const [items, setItems] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [focusId, setFocusId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id"));

  const token = async () => {
    const t = supabase ? (await supabase.auth.getSession()).data.session?.access_token : null;
    if (!t) throw new Error("Missing access token");
    return t;
  };

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/owner-claims?status=${focusId ? "all" : status}`, { headers: { authorization: `Bearer ${await token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load");
    }
  }, [status, user, focusId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, action: "approve" | "decline" | "revoke") => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/owner-claims", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id, action, verification_note: noteById[id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  const shown = focusId ? items.filter((i) => i.id === focusId) : items;

  return (
    <main className="mx-auto max-w-4xl p-4 md:p-6 space-y-4 font-hebrew" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">בקשות בעלות על מקום</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50">חזרה לאתר</a>
      </div>
      <p className="text-sm text-gray-600">
        לפני אישור: להתקשר או לשלוח וואטסאפ לטלפון שמופיע ברישום. אם אין טלפון ברישום, לראות הוכחה בשיחת וידאו או
        לקבל מסמך ולמחוק אותו מיד אחרי הבדיקה. כאן נשמרת רק הערה על איך אימתת.
      </p>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} className={`px-3 py-1.5 rounded border text-sm ${!focusId && status === t ? "bg-black text-white" : "bg-white"}`}
            onClick={() => { setFocusId(null); setStatus(t); window.history.replaceState(null, "", window.location.pathname); }}>
            {STATUS_HE[t]}
          </button>
        ))}
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={load}>רענון</button>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {shown.map((c) => (
        <section key={c.id} className="rounded-xl border bg-white p-4 space-y-2 shadow-sm text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="font-semibold text-base">{c.places?.name ?? "מקום"} <span className="text-gray-500 font-normal">({c.places?.place_category ?? "-"})</span></div>
            <span className="rounded px-2 py-0.5 bg-gray-100">{STATUS_HE[c.status]}</span>
          </div>
          <div className="text-gray-600">{c.places?.address ?? ""}</div>
          <div className="rounded-lg bg-blue-50 px-3 py-2">
            <strong>הטלפון שברישום:</strong>{" "}
            {c.places?.phone?.length ? c.places.phone.map((p) => <a key={p} href={`tel:${p}`} className="text-blue-700 underline ms-1">{p}</a>) : "אין טלפון ברישום"}
          </div>
          <div><strong>שם:</strong> {c.full_name}{c.role ? ` · ${c.role}` : ""}</div>
          <div><strong>טלפון לחזרה:</strong> <a href={`tel:${c.phone}`} className="text-blue-700 underline">{c.phone}</a></div>
          <div><strong>חשבון:</strong> {c.user_email ?? "החשבון נמחק"}</div>
          {c.note && <div><strong>הערה:</strong> {c.note}</div>}
          {c.other_claims.length > 0 && (
            <div className="text-amber-800"><strong>בקשות נוספות של אותו חשבון:</strong> {c.other_claims.map((o) => `${o.place} (${STATUS_HE[o.status]})`).join(", ")}</div>
          )}
          <div className="text-gray-500">נשלח: {fmt(c.created_at)}{c.decided_at ? ` · הוחלט: ${fmt(c.decided_at)}` : ""}</div>
          {c.verification_note && <div className="text-gray-700"><strong>איך אומת:</strong> {c.verification_note}</div>}

          {c.status === "pending" && (
            <div className="space-y-2 pt-1">
              <input className="w-full rounded border p-2" placeholder="איך אימתת? (למשל: התקשרתי לטלפון שברישום, 7.11)"
                value={noteById[c.id] ?? ""} onChange={(e) => setNoteById((p) => ({ ...p, [c.id]: e.target.value }))} />
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded bg-emerald-600 text-white disabled:opacity-60" disabled={busyId === c.id || !(noteById[c.id] ?? "").trim()}
                  onClick={() => decide(c.id, "approve")}>אישור</button>
                <button className="px-3 py-1.5 rounded bg-rose-600 text-white disabled:opacity-60" disabled={busyId === c.id}
                  onClick={() => decide(c.id, "decline")}>דחייה</button>
              </div>
            </div>
          )}
          {c.status === "approved" && (
            <button className="px-3 py-1.5 rounded border border-rose-300 text-rose-700 disabled:opacity-60" disabled={busyId === c.id}
              onClick={() => decide(c.id, "revoke")}>ביטול הבעלות</button>
          )}
        </section>
      ))}
      {shown.length === 0 && <div className="text-sm text-gray-500">אין בקשות.</div>}
    </main>
  );
}
