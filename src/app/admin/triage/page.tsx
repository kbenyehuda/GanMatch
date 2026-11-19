"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import {
  Banner, DecisionBar, DiffRow, EmptyState, InboxCard, InboxShell, InboxStyles, InboxTabs, ReasonField,
  classify, markInboxSeen, relTime, useUndoToast, type InboxTab,
} from "@/components/admin/inbox";

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
  metadata: Record<string, unknown> | null;
  ganim_v2?: { name_he?: string | null } | null;
  user_email?: string | null;
  engagement?: {
    total_submissions?: number; approved?: number; pending?: number; rejected?: number; last_submission_at?: string | null;
  } | null;
  diffs?: Array<{ field: string; label: string; before: string; after: string }>;
  requested_changes?: Array<{ field: string; label: string; value: string }>;
  guardrail_checks?: Array<{
    key: string; label: string; direction: string; baseThreshold: string; multiplier: string;
    threshold: string; actual: string; exceededBy: string; passed: boolean;
  }>;
};

const TYPE_LABEL: Record<string, string> = {
  edit_gan: "עריכת גן", edit: "עריכה", review: "ביקורת", suggest_gan: "הצעת גן חדש", suggest: "הצעה",
};

const nameOf = (i: QueueItem) => i.ganim_v2?.name_he || "הגן";

// Moderator inbox for gan edits / reviews / suggestions (user_inputs).
// A decision is sent after 5 seconds so it can still be undone: approving here has side effects
// (access grants, the background worker), so there is no "reopen" on the server for it.
export default function AdminTriagePage() {
  const { user, loading } = useSession();
  const [tab, setTab] = useState<InboxTab>("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [reloading, setReloading] = useState(false);
  const toast = useUndoToast();
  const pendingSend = useRef<{ id: string; timer: ReturnType<typeof setTimeout>; send: (keepalive?: boolean) => Promise<void> } | null>(null);

  const token = useCallback(async () => {
    if (!supabase) throw new Error("Missing session");
    const t = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
    if (!t) throw new Error("Missing access token");
    return t;
  }, []);

  const loadQueue = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/triage?status=all&limit=200`, { headers: { authorization: `Bearer ${await token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "טעינת הבקשות נכשלה");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "טעינת הבקשות נכשלה");
    } finally {
      setReloading(false);
    }
  }, [user, token]);

  useEffect(() => { if (user) loadQueue(); }, [user, loadQueue]);
  useEffect(() => { if (user && !reloading) markInboxSeen("triage"); }, [user, reloading]);

  const patch = useCallback((id: string, p: Partial<QueueItem>) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const flushPending = useCallback(() => {
    const p = pendingSend.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingSend.current = null;
    void p.send();
  }, []);

  // Don't lose a decision that is still inside its undo window when the page is closed.
  useEffect(() => {
    const onHide = () => {
      const p = pendingSend.current;
      if (!p) return;
      clearTimeout(p.timer);
      pendingSend.current = null;
      void p.send(true);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const decide = useCallback((item: QueueItem, next: "approved" | "rejected") => {
    flushPending();
    const before = { status: item.status, reviewed_at: item.reviewed_at, moderation_reason: item.moderation_reason };
    const reason = (reasonById[item.id] ?? "").trim() || null;
    patch(item.id, { status: next, reviewed_at: new Date().toISOString(), moderation_reason: reason });

    const send = async (keepalive = false) => {
      try {
        const res = await fetch("/api/admin/triage/decision", {
          method: "POST", keepalive,
          headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
          body: JSON.stringify({ id: item.id, status: next, moderation_reason: reason }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "הפעולה נכשלה");
      } catch (e: any) {
        patch(item.id, before);
        setError(typeof e?.message === "string" ? e.message : "הפעולה נכשלה");
      }
    };
    const timer = setTimeout(() => { pendingSend.current = null; void send(); }, 5000);
    pendingSend.current = { id: item.id, timer, send };
    toast.show(`השינוי עבור ${nameOf(item)} ${next === "approved" ? "אושר" : "נדחה"}`, () => {
      clearTimeout(timer);
      pendingSend.current = null;
      patch(item.id, before);
    });
  }, [flushPending, reasonById, patch, token, toast]);

  const classified = useMemo(() => items.map((i) => ({ item: i, state: classify(i) })), [items]);
  const counts = useMemo(() => ({
    pending: classified.filter((c) => c.state === "pending").length,
    approved: classified.filter((c) => c.state === "approved").length,
    declined: classified.filter((c) => c.state === "declined").length,
    all: classified.length,
  }), [classified]);
  const visible = classified.filter((c) => tab === "all" || c.state === tab);

  if (loading) return <div className="p-6">טוען...</div>;
  if (!user) return <div className="p-6">יש להתחבר כדי לגשת לכלי הניהול.</div>;

  return (
    <InboxShell title="תור אישורים">
      <InboxStyles />
      <InboxTabs tab={tab} onChange={setTab} counts={counts} onRefresh={loadQueue} reloading={reloading} />
      {error && <div style={{ background: "#FEE4E2", color: "#B42318", borderRadius: 12, padding: "10px 12px", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{error}</div>}
      {visible.length === 0 && !reloading && <EmptyState tab={tab} />}

      {visible.map(({ item, state }) => {
        const diffs = item.diffs ?? [];
        const failed = (item.guardrail_checks ?? []).filter((c) => !c.passed);
        const failedFor = (field: string) => {
          const f = field.toLowerCase();
          return failed.filter((c) => {
            const k = c.key.toLowerCase();
            if (k.includes(f)) return true;
            if (f === "monthly_price_nis" && k.includes("price_change")) return true;
            if (f === "operating_hours" && k.includes("operating_hours_change")) return true;
            if (f === "staff_child_ratio" && k.includes("staff_ratio_change")) return true;
            if ((f === "min_age_months" || f === "max_age_months") && k.includes("age_logic")) return true;
            if ((f === "price_notes" || f === "suggested_type") && k.includes("min_length")) return true;
            return false;
          });
        };
        const eng = item.engagement;
        return (
          <InboxCard key={item.id} state={state} name={nameOf(item)} chip={TYPE_LABEL[item.input_type ?? ""] ?? item.input_type}
            meta={<>{relTime(item.created_at)} · {item.user_email || item.user_id || "—"}</>}
            stamp={state === "pending" ? null : relTime(item.reviewed_at ?? item.created_at)}
            banner={state === "pending" && failed.length > 0 ? <Banner tone="amber">⚠ {failed.length} בדיקות חריגה נכשלו. כדאי לבדוק לפני אישור</Banner> : null}
            footer={state === "pending" ? (
              <DecisionBar onApprove={() => decide(item, "approved")} onDecline={() => decide(item, "rejected")}
                extra={<ReasonField value={reasonById[item.id] ?? ""} onChange={(v) => setReasonById((p) => ({ ...p, [item.id]: v }))} />} />
            ) : null}>
            {diffs.length > 0 ? diffs.map((d) => {
              const bad = failedFor(d.field);
              return (
                <div key={`${item.id}-${d.field}`} title={bad.map((c) => `${c.label}: ${c.actual} (מותר ${c.threshold})`).join("\n") || undefined}
                  style={bad.length ? { background: "#FFF1F2", borderRadius: 8, padding: "0 6px" } : undefined}>
                  <DiffRow state={state} label={d.label} before={d.before} after={d.after} />
                </div>
              );
            }) : (item.requested_changes ?? []).length > 0 ? (
              <>
                <div style={{ fontSize: 13, color: "#6B7689", marginBottom: 4 }}>אין השוואה לערכים הקיימים. אלה הערכים שנשלחו:</div>
                {(item.requested_changes ?? []).map((c) => (
                  <div key={`${item.id}-rq-${c.field}`} className="flex gap-2" style={{ padding: "7px 0", borderTop: "1px solid #EEF1F6", fontSize: 14 }}>
                    <div style={{ flex: "0 0 30%", fontWeight: 700, color: "#374151" }}>{c.label}</div>
                    <div style={{ flex: 1, wordBreak: "break-word" }}>{c.value}</div>
                  </div>
                ))}
              </>
            ) : <div style={{ fontSize: 13, color: "#6B7689" }}>אין שינויי שדות בבקשה הזו.</div>}

            {eng && (
              <div className="flex flex-wrap gap-x-3 gap-y-1" style={{ marginTop: 10, fontSize: 12.5, color: "#6B7689" }}>
                <span>משתמש/ת: {eng.total_submissions ?? 0} הגשות</span>
                <span style={{ color: "#047857" }}>✓ {eng.approved ?? 0}</span>
                <span style={{ color: "#B45309" }}>● {eng.pending ?? 0}</span>
                <span style={{ color: "#BE123C" }}>✕ {eng.rejected ?? 0}</span>
              </div>
            )}

            {failed.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#B45309" }}>בדיקות חריגה ({failed.length} נכשלו)</summary>
                <div style={{ marginTop: 6 }}>
                  {(item.guardrail_checks ?? []).map((c) => (
                    <div key={`${item.id}-chk-${c.key}`} className="flex items-center justify-between gap-2"
                      style={{ padding: "6px 8px", borderRadius: 8, background: c.passed ? "transparent" : "#FFF1F2", fontSize: 13 }} dir="ltr">
                      <span>{c.label}</span>
                      <span style={{ color: c.passed ? "#047857" : "#BE123C", fontWeight: 700 }}>
                        {c.passed ? "OK" : `FAIL · ${c.actual} > ${c.threshold}`}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: "pointer", fontSize: 12.5, color: "#6B7689" }}>נתונים גולמיים</summary>
                <pre dir="ltr" style={{ marginTop: 6, maxHeight: 200, overflow: "auto", background: "#F4F6FB", borderRadius: 8, padding: 8, fontSize: 11.5 }}>{JSON.stringify(item.metadata, null, 2)}</pre>
              </details>
            )}
            {state !== "pending" && item.moderation_reason && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#6B7689" }}>סיבה: {item.moderation_reason}</div>
            )}
          </InboxCard>
        );
      })}
      {toast.node}
    </InboxShell>
  );
}
