"use client";

// Shared "action-first inbox" building blocks for the admin moderation screens
// (place-location-requests, place-detail-requests, triage): sticky status tabs with live
// counts, three clearly different card states, approve/decline bar, and an undo toast.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, X, RotateCcw, Loader2, Inbox } from "lucide-react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

export type InboxState = "pending" | "approved" | "declined";
export type InboxTab = InboxState | "all";

export interface InboxBase {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  moderation_reason: string | null;
  auto_applied?: boolean;
  reverted_at?: string | null;
  admin_seen_at?: string | null;
}

/** Which of the three states a request is in. Owner edits that went live count as pending until seen. */
export function classify(i: Pick<InboxBase, "status" | "auto_applied" | "reverted_at" | "admin_seen_at">): InboxState {
  if (i.reverted_at) return "declined";
  if (i.auto_applied) return i.admin_seen_at ? "approved" : "pending";
  if (i.status === "pending") return "pending";
  return i.status === "rejected" ? "declined" : "approved";
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שע׳`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "אתמול" : `לפני ${days} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

const STATE_STYLE: Record<InboxState, { bar: string; card: string; badgeBg: string; badgeFg: string; label: string; icon: string }> = {
  pending: { bar: "#F59E0B", card: "#FFFFFF", badgeBg: "#FEF3C7", badgeFg: "#92400E", label: "ממתין לאישור", icon: "●" },
  approved: { bar: "#059669", card: "rgba(236,253,245,.5)", badgeBg: "#059669", badgeFg: "#FFFFFF", label: "אושר", icon: "✓" },
  declined: { bar: "#F43F5E", card: "#F9FAFB", badgeBg: "#FFE4E6", badgeFg: "#BE123C", label: "נדחה", icon: "✕" },
};

/** "Last opened" marker per queue, kept in this browser. The profile page uses it to badge what's new. */
export const INBOX_SEEN_PREFIX = "gmt_admin_seen_";
export function markInboxSeen(key: "location" | "detail" | "triage") {
  try { window.localStorage.setItem(INBOX_SEEN_PREFIX + key, new Date().toISOString()); } catch {}
}

// ───────────────────────── Layout ─────────────────────────

export function InboxShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main dir="rtl" className="font-hebrew mx-auto" style={{ maxWidth: 760, padding: "0 16px 120px", minHeight: "100vh", background: "#F4F6FB" }}>
      <div className="flex items-center justify-between" style={{ padding: "18px 0 10px" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A2B6B" }}>{title}</h1>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: "#1F5BB5", textDecoration: "none" }}>חזרה לאתר ›</a>
      </div>
      {children}
    </main>
  );
}

export function InboxTabs({ tab, onChange, counts, onRefresh, reloading }: {
  tab: InboxTab; onChange: (t: InboxTab) => void;
  counts: { pending: number; approved: number; declined: number; all: number };
  onRefresh: () => void; reloading: boolean;
}) {
  const tabs: { id: InboxTab; label: string; n: number; tint: string; fg: string }[] = [
    { id: "pending", label: "ממתינים", n: counts.pending, tint: "#F59E0B", fg: "#FFFFFF" },
    { id: "approved", label: "אושרו", n: counts.approved, tint: "#D1FAE5", fg: "#047857" },
    { id: "declined", label: "נדחו", n: counts.declined, tint: "#FFE4E6", fg: "#BE123C" },
    { id: "all", label: "הכל", n: counts.all, tint: "#E5E9F0", fg: "#4A5568" },
  ];
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, background: "#F4F6FB", padding: "8px 0 12px" }}>
      <div className="flex items-center gap-2">
        <div role="tablist" className="flex flex-1" style={{ background: "#E8ECF4", borderRadius: 14, padding: 4, gap: 2 }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={active} onClick={() => onChange(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5"
                style={{ minHeight: 42, borderRadius: 11, border: 0, cursor: "pointer", fontSize: 14, fontWeight: active ? 800 : 600,
                  background: active ? "#fff" : "transparent", color: active ? "#0A2B6B" : "#5B667A",
                  boxShadow: active ? "0 1px 4px rgba(10,43,107,.15)" : "none", transition: "all .15s" }}>
                {t.label}
                <span style={{ minWidth: 22, height: 22, padding: "0 6px", borderRadius: 99, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 800, background: t.tint, color: t.fg }}>{t.n}</span>
              </button>
            );
          })}
        </div>
        <button onClick={onRefresh} disabled={reloading} aria-label="רענון"
          style={{ width: 42, height: 42, borderRadius: 12, border: 0, background: "#E8ECF4", color: "#0A2B6B", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {reloading ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : <RotateCcw style={{ width: 16, height: 16 }} />}
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ tab }: { tab: InboxTab }) {
  const msg = tab === "pending" ? ["הכל טופל!", "אין בקשות ממתינות 🎉"] : tab === "approved" ? ["אין עדיין אישורים", ""] : tab === "declined" ? ["אין בקשות שנדחו", ""] : ["אין בקשות", ""];
  return (
    <div className="flex flex-col items-center text-center" style={{ padding: "56px 16px", color: "#5B667A" }}>
      <Inbox style={{ width: 40, height: 40, color: "#9AA6BA", marginBottom: 10 }} />
      <div style={{ fontSize: 18, fontWeight: 800, color: "#0A2B6B" }}>{msg[0]}</div>
      {msg[1] && <div style={{ fontSize: 14, marginTop: 4 }}>{msg[1]}</div>}
    </div>
  );
}

// ───────────────────────── Card ─────────────────────────

/** The card shell. The start-edge bar + background make the state readable before any text. */
export function InboxCard({ state, name, chip, meta, stamp, banner, children, footer }: {
  state: InboxState; name: string; chip?: string | null; meta?: React.ReactNode;
  stamp?: string | null; banner?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode;
}) {
  const st = STATE_STYLE[state];
  return (
    <section style={{
      background: st.card, borderRadius: 16, marginBottom: 12, overflow: "hidden",
      border: "1px solid #E5E9F0", borderInlineStart: `4px solid ${st.bar}`,
      boxShadow: state === "pending" ? "0 4px 14px rgba(10,43,107,.10)" : "none",
      opacity: state === "declined" ? 0.78 : 1, animation: "inboxIn .2s ease-out",
    }}>
      <div style={{ padding: "14px 14px 12px" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ fontSize: 16, fontWeight: 800, color: "#0F1A2E" }}>{name}</span>
              {chip && <span style={{ fontSize: 11.5, fontWeight: 700, background: "#E8F0FB", color: "#0A2B6B", borderRadius: 99, padding: "2px 9px" }}>{chip}</span>}
            </div>
            {meta && <div style={{ fontSize: 12.5, color: "#6B7689", marginTop: 3 }}>{meta}</div>}
          </div>
          <span className="shrink-0" style={{ background: st.badgeBg, color: st.badgeFg, borderRadius: 99, padding: "3px 11px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
            {st.icon} {st.label}{stamp ? ` · ${stamp}` : ""}
          </span>
        </div>
        {banner && <div style={{ marginTop: 10 }}>{banner}</div>}
        {children && <div style={{ marginTop: 12 }}>{children}</div>}
      </div>
      {footer}
    </section>
  );
}

export function Banner({ tone, children }: { tone: "amber" | "red" | "green" | "blue"; children: React.ReactNode }) {
  const t = { amber: ["#FFF7E6", "#7A4A00"], red: ["#FEE4E2", "#B42318"], green: ["#DCF3E6", "#1D7F4F"], blue: ["#E8F0FB", "#0A2B6B"] }[tone];
  return <div style={{ background: t[0], color: t[1], borderRadius: 10, padding: "7px 11px", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>{children}</div>;
}

/** Before → after. Pending: proposed highlighted. Approved: old struck through. Declined: proposed struck through. */
export function DiffRow({ label, before, after, state }: { label: string; before: string; after: string; state: InboxState }) {
  const oldStyle: React.CSSProperties = state === "approved"
    ? { textDecoration: "line-through", color: "#9CA3AF" } : { color: "#6B7689" };
  const newStyle: React.CSSProperties = state === "declined"
    ? { textDecoration: "line-through", color: "#FB7185" }
    : state === "approved" ? { color: "#047857", fontWeight: 800 }
    : { background: "#DBEAFE", color: "#1E40AF", fontWeight: 800, borderRadius: 8, padding: "2px 8px" };
  return (
    <div className="flex items-center gap-2" style={{ padding: "8px 0", borderTop: "1px solid #EEF1F6" }}>
      <div style={{ flex: "0 0 30%", fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</div>
      <div className="flex flex-1 items-center flex-wrap gap-2" style={{ fontSize: 14 }}>
        <span style={oldStyle}>{before}</span>
        <span aria-hidden style={{ color: "#9AA6BA" }}>←</span>
        <span style={newStyle}>{after}</span>
      </div>
    </div>
  );
}

// ───────────────────────── Actions ─────────────────────────

/** Full-width touch targets: approve (60%) + decline (40%). */
export function DecisionBar({ onApprove, onDecline, busy, approveLabel = "אישור", declineLabel = "דחייה", extra }: {
  onApprove: () => void; onDecline: () => void; busy?: boolean; approveLabel?: string; declineLabel?: string; extra?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0 14px 14px" }}>
      <div className="flex gap-2">
        <button onClick={onApprove} disabled={busy}
          className="flex items-center justify-center gap-2"
          style={{ flex: "0 0 calc(60% - 4px)", minHeight: 50, borderRadius: 14, border: 0, cursor: busy ? "not-allowed" : "pointer", background: "#16A34A", color: "#fff", fontSize: 16, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
          <Check style={{ width: 19, height: 19 }} />{approveLabel}
        </button>
        <button onClick={onDecline} disabled={busy}
          className="flex items-center justify-center gap-2"
          style={{ flex: 1, minHeight: 50, borderRadius: 14, border: 0, cursor: busy ? "not-allowed" : "pointer", background: "#FEF2F2", color: "#DC2626", fontSize: 16, fontWeight: 800, opacity: busy ? 0.6 : 1 }}>
          <X style={{ width: 19, height: 19 }} />{declineLabel}
        </button>
      </div>
      {extra}
    </div>
  );
}

export function QuietLink({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <div style={{ padding: "0 14px 12px" }}>
      <button onClick={onClick} disabled={disabled}
        style={{ background: "none", border: 0, cursor: "pointer", color: "#6B7689", fontSize: 13, fontWeight: 600, textDecoration: "underline", padding: "6px 0", minHeight: 32 }}>
        {children}
      </button>
    </div>
  );
}

/** Optional reason, tucked behind a link so deciding stays one tap. */
export function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!open && !value) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: "none", border: 0, cursor: "pointer", color: "#6B7689", fontSize: 12.5, fontWeight: 600, padding: "8px 0 0" }}>
        + הוספת סיבה (אופציונלי)
      </button>
    );
  }
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} placeholder="סיבה (לא חובה)"
      style={{ width: "100%", marginTop: 8, borderRadius: 10, border: "1px solid #E5E9F0", padding: 10, fontSize: 14, background: "#fff", fontFamily: "inherit" }} />
  );
}

// ───────────────────────── Undo toast ─────────────────────────

export function useUndoToast() {
  const [toast, setToast] = useState<{ msg: string; undo?: () => void; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, undo?: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ msg, undo, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = toast ? (
    <div key={toast.key} role="status" className="flex items-center gap-3"
      style={{ position: "fixed", insetInline: 16, bottom: 20, margin: "0 auto", maxWidth: 440, zIndex: 50, background: "#0F1A2E", color: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 10px 30px rgba(0,0,0,.3)", animation: "inboxIn .2s ease-out" }}>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{toast.msg}</span>
      {toast.undo && (
        <button onClick={() => { const u = toast.undo; setToast(null); u?.(); }}
          style={{ background: "rgba(255,255,255,.14)", border: 0, color: "#fff", borderRadius: 10, padding: "8px 14px", fontSize: 14, fontWeight: 800, cursor: "pointer", minHeight: 38 }}>
          ביטול
        </button>
      )}
    </div>
  ) : null;
  return { show, node };
}

export function InboxStyles() {
  return <style>{`@keyframes inboxIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>;
}

// ───────────────────────── Data hook (location + detail requests) ─────────────────────────

type Action = "approve" | "reject" | "revert" | "seen" | "reopen";

const SKIPPED_PREFIX = "gmt_admin_hidden_";

export function useInboxQueue<T extends InboxBase>(opts: { listUrl: string; decisionUrl: string; skipKey: string; seenKey: "location" | "detail"; nameOf: (i: T) => string }) {
  const { listUrl, decisionUrl, skipKey, seenKey, nameOf } = opts;
  const { user, loading } = useSession();
  const [tab, setTab] = useState<InboxTab>("pending");
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [reloading, setReloading] = useState(false);
  const toast = useUndoToast();
  const [focusId, setFocusId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id"));
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(SKIPPED_PREFIX + skipKey) ?? "[]")); } catch { return new Set(); }
  });
  const [showHidden, setShowHidden] = useState(false);
  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem(SKIPPED_PREFIX + skipKey, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, [skipKey]);
  const showAll = useCallback(() => {
    setFocusId(null);
    setTab("pending");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const token = useCallback(async () => {
    if (!supabase) throw new Error("Missing session");
    const t = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
    if (!t) throw new Error("Missing access token");
    return t;
  }, []);

  const reload = useCallback(async () => {
    if (!supabase || !user) return;
    setReloading(true);
    setError(null);
    try {
      const res = await fetch(`${listUrl}?status=all&limit=200`, { headers: { authorization: `Bearer ${await token()}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "טעינת הבקשות נכשלה");
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "טעינת הבקשות נכשלה");
    } finally {
      setReloading(false);
    }
  }, [listUrl, user, token]);

  useEffect(() => { if (user) reload(); }, [user, reload]);
  // Opening the queue counts as having seen what's in it
  useEffect(() => { if (user && !reloading && items.length >= 0) markInboxSeen(seenKey); }, [user, reloading, items.length, seenKey]);

  const patch = useCallback((id: string, p: Partial<InboxBase>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }, []);

  /** Optimistic: update the card at once, call the API, roll back on failure. */
  const decide = useCallback(async (item: T, action: Action, opts2?: { silent?: boolean }) => {
    const before: Partial<InboxBase> = {
      status: item.status, reviewed_at: item.reviewed_at, moderation_reason: item.moderation_reason,
      reverted_at: item.reverted_at, admin_seen_at: item.admin_seen_at,
    };
    const now = new Date().toISOString();
    const reason = (reasonById[item.id] ?? "").trim() || null;
    const optimistic: Record<Action, Partial<InboxBase>> = {
      approve: { status: "approved", reviewed_at: now, moderation_reason: reason },
      reject: { status: "rejected", reviewed_at: now, moderation_reason: reason },
      reopen: { status: "pending", reviewed_at: null, moderation_reason: null },
      seen: { admin_seen_at: now },
      revert: { reverted_at: now, admin_seen_at: now, moderation_reason: reason },
    };
    patch(item.id, optimistic[action]);
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(decisionUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: item.id, action, moderation_reason: reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "הפעולה נכשלה");
      if (focusId === item.id) { setFocusId(null); window.history.replaceState(null, "", window.location.pathname); }
      if (!opts2?.silent) {
        const name = nameOf(item);
        const undoable = action === "approve" || action === "reject";
        const msg = action === "approve" ? `השינוי עבור ${name} אושר`
          : action === "reject" ? `השינוי עבור ${name} נדחה`
          : action === "reopen" ? `${name} הוחזר להמתנה`
          : action === "seen" ? `${name} נשאר כפי שהוא`
          : `השינוי של ${name} בוטל`;
        toast.show(msg, undoable ? () => { void decide({ ...item, ...optimistic[action] } as T, "reopen", { silent: true }).then(() => toast.show(`${name} הוחזר להמתנה`)); } : undefined);
      }
    } catch (e: any) {
      patch(item.id, before);
      setError(typeof e?.message === "string" ? e.message : "הפעולה נכשלה");
    } finally {
      setBusyId(null);
    }
  }, [decisionUrl, reasonById, patch, token, focusId, nameOf, toast]);

  const classified = useMemo(() => items.map((i) => ({ item: i, state: classify(i) })), [items]);
  const skippedPending = classified.filter((c) => c.state === "pending" && hiddenIds.has(c.item.id));
  const counts = useMemo(() => {
    const live = classified.filter((c) => !(c.state === "pending" && hiddenIds.has(c.item.id) && !showHidden));
    return {
      pending: live.filter((c) => c.state === "pending").length,
      approved: classified.filter((c) => c.state === "approved").length,
      declined: classified.filter((c) => c.state === "declined").length,
      all: live.length,
    };
  }, [classified, hiddenIds, showHidden]);

  const visible = useMemo(() => {
    if (focusId) return classified.filter((c) => c.item.id === focusId);
    return classified.filter((c) => {
      if (c.state === "pending" && hiddenIds.has(c.item.id) && !showHidden) return false;
      return tab === "all" || c.state === tab;
    });
  }, [classified, focusId, tab, hiddenIds, showHidden]);

  return {
    user, loading, tab, setTab, counts, visible, reload, reloading, error, busyId, decide,
    reasonById, setReasonById, toastNode: toast.node, focusId, showAll,
    hiddenIds, toggleHidden, showHidden, setShowHidden, skippedCount: skippedPending.length,
  };
}

export function SkippedToggle({ count, show, onToggle }: { count: number; show: boolean; onToggle: () => void }) {
  if (count === 0) return null;
  return (
    <button onClick={onToggle} style={{ background: "none", border: 0, cursor: "pointer", color: "#6B7689", fontSize: 13, fontWeight: 600, textDecoration: "underline", padding: "0 0 10px" }}>
      {show ? "הסתרת המדולגות" : `הצגת מדולגות (${count})`}
    </button>
  );
}

export function FocusBanner({ onShowAll }: { onShowAll: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2" style={{ background: "#E8F0FB", borderRadius: 12, padding: "10px 12px", marginBottom: 12, fontSize: 14, fontWeight: 700, color: "#0A2B6B" }}>
      <span>מוצגת בקשה אחת מהמייל</span>
      <button onClick={onShowAll} style={{ background: "#fff", border: 0, borderRadius: 10, padding: "7px 12px", fontSize: 13, fontWeight: 800, color: "#0A2B6B", cursor: "pointer" }}>לכל הבקשות</button>
    </div>
  );
}
