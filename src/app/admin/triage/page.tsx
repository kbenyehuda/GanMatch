"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type QueueStatus = "pending" | "approved" | "rejected";

type QueueItem = {
  id: string;
  user_id: string | null;
  gan_id: string | null;
  input_type: string | null;
  status: QueueStatus;
  moderation_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  address: string | null;
  city: string | null;
  website_url: string | null;
  operating_hours: string | null;
  friday_schedule: string | null;
  vacancy_status: string | null;
  has_mamad: boolean | null;
  has_outdoor_space: boolean | null;
  first_aid_trained: boolean | null;
  metadata: Record<string, unknown> | null;
  ganim_v2?: { name_he?: string | null } | null;
  user_email?: string | null;
  engagement?: {
    total_submissions?: number;
    approved?: number;
    pending?: number;
    rejected?: number;
    last_submission_at?: string | null;
  } | null;
  diffs?: Array<{ field: string; label: string; before: string; after: string }>;
  requested_changes?: Array<{ field: string; label: string; value: string }>;
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

export default function AdminTriagePage() {
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
      const res = await fetch(`/api/admin/triage?status=${status}&limit=200`, {
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
    async (itemId: string, nextStatus: "approved" | "rejected") => {
      if (!supabase || !user) return;
      setBusyId(itemId);
      setError(null);
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) throw new Error("Missing access token");
        const reason = (reasonById[itemId] ?? "").trim();
        const res = await fetch("/api/admin/triage/decision", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: itemId,
            status: nextStatus,
            moderation_reason: reason || null,
          }),
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

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }
  if (!user) {
    return <div className="p-6">Sign in to access admin triage.</div>;
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-hebrew">Admin Triage</h1>
        <a
          href="/"
          className="px-3 py-1.5 rounded border text-sm bg-white hover:bg-gray-50"
          title="Back to site"
        >
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
          <section key={item.id} className="rounded-xl border bg-white p-4 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-base">{item.ganim_v2?.name_he || "Gan"} ({item.input_type || "-"})</div>
                <div className="text-gray-600">
                  Submitted {formatAge(item.created_at)} ({formatDate(item.created_at)})
                </div>
              </div>
              <div className="px-2 py-1 rounded-full text-xs border bg-gray-50">
                Changes: {item.diffs?.length ?? 0}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm rounded-lg border bg-gray-50 p-3">
              <div><span className="font-semibold">Gan ID:</span> {item.gan_id || "-"}</div>
              <div><span className="font-semibold">User ID:</span> {item.user_id || "-"}</div>
              <div><span className="font-semibold">User email:</span> {item.user_email || "—"}</div>
            </div>

            <div className="rounded-lg border bg-gray-50 p-3">
              <div className="text-sm font-semibold mb-2">User engagement</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                <div className="rounded border bg-white px-2 py-1">
                  <div className="text-gray-500 text-xs">Total submissions</div>
                  <div className="font-semibold">{item.engagement?.total_submissions ?? 0}</div>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <div className="text-gray-500 text-xs">Approved</div>
                  <div className="font-semibold text-emerald-700">{item.engagement?.approved ?? 0}</div>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <div className="text-gray-500 text-xs">Pending</div>
                  <div className="font-semibold text-amber-700">{item.engagement?.pending ?? 0}</div>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <div className="text-gray-500 text-xs">Rejected</div>
                  <div className="font-semibold text-rose-700">{item.engagement?.rejected ?? 0}</div>
                </div>
                <div className="rounded border bg-white px-2 py-1">
                  <div className="text-gray-500 text-xs">Last submission</div>
                  <div className="font-semibold text-xs">{formatDate(item.engagement?.last_submission_at ?? null)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-12 bg-gray-100 text-xs font-semibold px-3 py-2">
                <div className="col-span-4">Field</div>
                <div className="col-span-4">Before</div>
                <div className="col-span-4">After</div>
              </div>
              {(item.diffs ?? []).length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-600">
                  No computed before/after diff detected.
                </div>
              ) : (
                <div className="divide-y">
                  {(item.diffs ?? []).map((d) => (
                    <div key={`${item.id}-${d.field}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                      <div className="col-span-4 font-medium">{d.label}</div>
                      <div className="col-span-4 text-gray-600 break-words">{d.before}</div>
                      <div className="col-span-4 text-emerald-700 break-words">{d.after}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {(item.requested_changes ?? []).length > 0 ? (
              <details className="rounded-lg border overflow-hidden">
                <summary className="bg-gray-100 text-xs font-semibold px-3 py-2 cursor-pointer">
                  Requested changes (raw input)
                </summary>
                <div className="divide-y">
                  {(item.requested_changes ?? []).map((c) => (
                    <div key={`${item.id}-requested-${c.field}`} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                      <div className="col-span-4 font-medium">{c.label}</div>
                      <div className="col-span-8 break-words text-indigo-700">{c.value}</div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {item.metadata && Object.keys(item.metadata).length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-semibold">Raw metadata (debug)</summary>
                <pre className="mt-2 max-h-52 overflow-auto rounded bg-gray-50 p-2 text-xs">
{JSON.stringify(item.metadata, null, 2)}
                </pre>
              </details>
            ) : null}

            {status === "pending" ? (
              <div className="flex flex-col gap-2">
                <textarea
                  placeholder="Reason (optional)"
                  value={reasonById[item.id] ?? ""}
                  onChange={(e) =>
                    setReasonById((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  className="w-full rounded border p-2 text-sm"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "approved")}
                  >
                    Approve
                  </button>
                  <button
                    className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm disabled:opacity-60"
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, "rejected")}
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
      </div>
    </main>
  );
}

