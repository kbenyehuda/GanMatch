"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type QueueStatus = "pending" | "approved" | "rejected";

type QueueItem = {
  id: string;
  place_id: string;
  user_id: string | null;
  requested_lat: number;
  requested_lon: number;
  requested_address: string | null;
  note: string | null;
  previous_lat: number | null;
  previous_lon: number | null;
  previous_address: string | null;
  status: QueueStatus;
  moderation_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  places?: { name?: string | null; address?: string | null; place_category?: string | null } | null;
  user_email?: string | null;
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

function mapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

export default function AdminPlaceLocationRequestsPage() {
  const { user, loading } = useSession();
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [reloading, setReloading] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
      if (!token) throw new Error("Missing access token");
      const res = await fetch(`/api/admin/place-location-requests?status=${status}&limit=200`, {
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
  }, [status, user]);

  useEffect(() => {
    if (!user) return;
    loadQueue();
  }, [user, loadQueue]);

  const decide = useCallback(
    async (itemId: string, action: "approve" | "reject") => {
      if (!supabase || !user) return;
      setBusyId(itemId);
      setError(null);
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) throw new Error("Missing access token");
        const reason = (reasonById[itemId] ?? "").trim();
        const res = await fetch("/api/admin/place-location-requests/decision", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: itemId, action, moderation_reason: reason || null }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Decision failed");
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      } catch (e: any) {
        setError(typeof e?.message === "string" ? e.message : "Decision failed");
      } finally {
        setBusyId(null);
      }
    },
    [reasonById, user]
  );

  const title = useMemo(() => {
    if (status === "pending") return "Pending";
    if (status === "approved") return "Approved";
    return "Rejected";
  }, [status]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!user) return <div className="p-6">Sign in to access admin tools.</div>;

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-hebrew">Place Location Requests</h1>
        <a href="/" className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50" title="Back to site">
          Back to site
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "pending" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("pending")}
        >
          Pending
        </button>
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "approved" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("approved")}
        >
          Approved
        </button>
        <button
          className={`px-3 py-1.5 rounded border text-sm ${status === "rejected" ? "bg-black text-white" : "bg-white"}`}
          onClick={() => setStatus("rejected")}
        >
          Rejected
        </button>
        <button className="px-3 py-1.5 rounded border text-sm bg-white" onClick={loadQueue} disabled={reloading}>
          {reloading ? "Refreshing..." : "Refresh"}
        </button>
        <span className="text-sm text-gray-600">{title}: {items.length}</span>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="space-y-4">
        {items.map((item) => (
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

            {item.note && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 font-hebrew">
                <span className="font-semibold">Note: </span>{item.note}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm" dir="ltr">
              <div className="rounded-lg border bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">Before (current)</div>
                {item.previous_lat != null && item.previous_lon != null ? (
                  <a href={mapsLink(item.previous_lat, item.previous_lon)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                    {item.previous_lat.toFixed(5)}, {item.previous_lon.toFixed(5)}
                  </a>
                ) : (
                  <span className="text-gray-500">no location on file</span>
                )}
                <div className="text-gray-700 mt-1 font-hebrew" dir="rtl">{item.previous_address || "—"}</div>
              </div>
              <div className="rounded-lg border bg-emerald-50 p-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">After (proposed)</div>
                <a href={mapsLink(item.requested_lat, item.requested_lon)} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-medium">
                  {item.requested_lat.toFixed(5)}, {item.requested_lon.toFixed(5)}
                </a>
                <div className="text-gray-700 mt-1 font-hebrew" dir="rtl">{item.requested_address || "—"}</div>
              </div>
            </div>

            {status === "pending" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  placeholder="Reason (optional)"
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
                    Approve
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "reject")}
                  >
                    Reject
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
