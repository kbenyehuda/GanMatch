"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { KIDS_FIELD_LABELS, formatKidsValue } from "@/lib/kids-attributes";
import { BASIC_FIELD_LABELS, formatBasicValue } from "@/lib/place-basic-details";
import { OwnerLabels, type OwnerContextView } from "@/components/admin/OwnerLabels";

const fieldLabel = (k: string) => KIDS_FIELD_LABELS[k] ?? BASIC_FIELD_LABELS[k] ?? k;
const fieldValue = (k: string, v: unknown) => (k in KIDS_FIELD_LABELS ? formatKidsValue(k, v) : formatBasicValue(k, v));

type QueueStatus = "pending" | "approved" | "rejected" | "owner";

const HIDDEN_KEY = "gmt_admin_hidden_detail_requests";

type QueueItem = {
  id: string;
  place_id: string;
  user_id: string | null;
  changes: Record<string, unknown>;
  previous: Record<string, unknown> | null;
  status: QueueStatus;
  moderation_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  places?: { name?: string | null; address?: string | null; place_category?: string | null } | null;
  user_email?: string | null;
  auto_applied?: boolean;
  reverted_at?: string | null;
  admin_seen_at?: string | null;
  owner?: OwnerContextView | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("he-IL");
}

function formatAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "-";
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// "ערכו פרטים" requests: a parent's changes to a gan wait here until approved.
export default function AdminPlaceDetailRequestsPage() {
  const { user, loading } = useSession();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [reloading, setReloading] = useState(false);
  // ?id=<request> (the link in the admin email) shows just that request.
  const [focusId, setFocusId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id"));
  // "דילוג": hide a request from this browser's queue without deciding on it.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(HIDDEN_KEY) ?? "[]")); } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);
  const showAll = useCallback(() => {
    setFocusId(null);
    setStatus("pending");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const loadQueue = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing access token");
      const res = await fetch(`/api/admin/place-detail-requests?status=${focusId ? "all" : status}&limit=200`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Failed to load queue");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "Failed to load queue");
      setItems([]);
    } finally {
      setReloading(false);
    }
  }, [status, user, focusId]);

  useEffect(() => {
    if (!user) return;
    loadQueue();
  }, [user, loadQueue]);

  const decide = useCallback(
    async (itemId: string, action: "approve" | "reject" | "revert" | "seen") => {
      if (!supabase || !user) return;
      setBusyId(itemId);
      setError(null);
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) throw new Error("Missing access token");
        const reason = (reasonById[itemId] ?? "").trim();
        const res = await fetch("/api/admin/place-detail-requests/decision", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: itemId, action, moderation_reason: reason || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Decision failed");
        if (action === "revert" && status !== "pending") setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, reverted_at: new Date().toISOString() } : i)));
        else setItems((prev) => prev.filter((i) => i.id !== itemId));
        if (focusId === itemId) showAll();
      } catch (e: any) {
        setError(typeof e?.message === "string" ? e.message : "Decision failed");
      } finally {
        setBusyId(null);
      }
    },
    [reasonById, user, focusId, showAll, status]
  );

  const title = useMemo(() => {
    if (status === "pending") return "ממתינות";
    if (status === "approved") return "אושרו";
    if (status === "owner") return "שינויים של בעלי מקומות";
    return "נדחו";
  }, [status]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-hebrew">בקשות עדכון פרטים</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50" title="חזרה לאתר">
          חזרה לאתר
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "pending" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("pending")}
        >
          ממתינות
        </button>
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "approved" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("approved")}
        >
          אושרו
        </button>
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "rejected" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("rejected")}
        >
          נדחו
        </button>
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "owner" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("owner")}
        >
          שינויים של בעלים (אושרו אוטומטית)
        </button>
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={loadQueue} disabled={reloading}>
          {reloading ? "מרענן..." : "רענון"}
        </button>
        <span className="text-sm text-gray-600">{title}: {items.length}</span>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="space-y-4">
        {focusId && (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-blue-50 px-3 py-2 text-sm font-hebrew">
            <span>מוצגת בקשה אחת מהמייל</span>
            <button className="px-3 py-1.5 rounded border bg-white text-sm" onClick={showAll}>לכל הבקשות הממתינות</button>
          </div>
        )}
        {!focusId && status === "pending" && hiddenIds.size > 0 && (
          <button className="text-sm text-gray-600 underline font-hebrew" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? "הסתרת המדולגות" : `הצגת מדולגות (${items.filter((i) => hiddenIds.has(i.id)).length})`}
          </button>
        )}
        {items
          .filter((item) => (focusId ? item.id === focusId : status !== "pending" || showHidden || !hiddenIds.has(item.id)))
          .map((item) => (
          <section key={item.id} className="rounded-xl border bg-white p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-base font-hebrew">
                  {item.places?.name || "Place"} ({item.places?.place_category || "-"})
                </div>
                <div className="text-gray-600">
                  Submitted {formatAge(item.created_at)} ({formatDate(item.created_at)})
                </div>
              </div>
              <div className="text-xs text-gray-600">
                <div>User: {item.user_email || item.user_id || "-"}</div>
              </div>
            </div>
            {item.auto_applied && (
              <div className="rounded px-2 py-1 text-sm font-bold font-hebrew" style={{ background: item.reverted_at ? "#FEE4E2" : "#DCF3E6", color: item.reverted_at ? "#B42318" : "#1D7F4F" }}>
                {item.reverted_at ? `אושר אוטומטית – בעל/ת המקום · בוטל ${formatDate(item.reverted_at)}` : "אושר אוטומטית – בעל/ת המקום (כבר באתר)"}
              </div>
            )}
            {item.changes?.remove_listing === true && (
              <div className="rounded px-2 py-1 text-sm font-bold font-hebrew bg-rose-50 text-rose-700">
                {item.status === "pending"
                  ? "בקשה להסרת הרישום. המקום כבר מוסתר מהאתר. אישור ישאיר אותו מוסתר, דחייה תחזיר אותו (המידע לא נמחק)."
                  : "בקשה להסרת הרישום."}
              </div>
            )}
            <OwnerLabels owner={item.owner} />

            <table className="w-full text-sm font-hebrew">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="text-start font-semibold pb-1">שדה</th>
                  <th className="text-start font-semibold pb-1">{item.auto_applied ? "לפני" : "עכשיו"}</th>
                  <th className="text-start font-semibold pb-1">{item.auto_applied ? "אחרי" : "מבוקש"}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(item.changes ?? {}).map(([key, value]) => (
                  <tr key={key} className="border-t">
                    <td className="py-1.5 font-semibold">{fieldLabel(key)}</td>
                    <td className="py-1.5 text-gray-500">{fieldValue(key, item.previous?.[key])}</td>
                    <td className="py-1.5 text-emerald-700 font-semibold">{fieldValue(key, value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {item.status === "pending" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  placeholder="סיבה (לא חובה)"
                  value={reasonById[item.id] ?? ""}
                  onChange={(e) => setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="w-full rounded border p-2 text-sm"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "approve")}
                  >
                    אישור
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "reject")}
                  >
                    דחייה
                  </button>
                  <button
                    className="px-3 py-1.5 rounded border text-sm bg-white"
                    onClick={() => toggleHidden(item.id)}
                  >
                    {hiddenIds.has(item.id) ? "החזרה לתור" : "דילוג (הסתרה)"}
                  </button>
                </div>
              </div>
            ) : item.auto_applied && !item.reverted_at ? (
              <div className="flex flex-col gap-2">
                <textarea
                  placeholder="סיבה לביטול (לא חובה)"
                  value={reasonById[item.id] ?? ""}
                  onChange={(e) => setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  className="w-full rounded border p-2 text-sm"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  {!item.admin_seen_at && (
                    <button
                      className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                      disabled={busyId === item.id}
                      onClick={() => decide(item.id, "seen")}
                    >
                      ראיתי, להשאיר
                    </button>
                  )}
                  <button
                    className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "revert")}
                  >
                    ביטול השינוי (החזרה לערכים הקודמים)
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">
                Reviewed: {formatDate(item.reviewed_at)}{item.moderation_reason ? ` - ${item.moderation_reason}` : ""}
              </div>
            )}
          </section>
        ))}
        {items.length === 0 && !reloading && (
          <div className="text-sm text-gray-500 font-hebrew">No {title.toLowerCase()} requests.</div>
        )}
      </div>
    </main>
  );
}
