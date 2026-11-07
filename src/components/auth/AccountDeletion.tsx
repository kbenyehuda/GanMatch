"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import { useSession } from "@/lib/useSession";
import { REMOVAL_REASONS } from "@/lib/place-basic-details";

/**
 * Account deletion like Instagram/Facebook (decisions 2026-11-07): choose what happens to your
 * recommendations (and, for owners, to your places), type "מחיקה", and the account is deleted
 * after 30 days unless you sign in and cancel.
 */

type OwnedPlace = { place_id: string; name: string };
type PlaceChoice = { remove: boolean; reason: string; details: string };

const CONFIRM_WORD = "מחיקה";

async function api(token: string, method: "GET" | "POST" | "DELETE", body?: unknown) {
  const res = await fetch("/api/account/deletion", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "שגיאה");
  return data;
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0F1A2E", marginBottom: 6, display: "block" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #E5E9F0", background: "#fff", fontSize: 14 };

export function DeleteAccountModal({ onClose, onScheduled }: { onClose: () => void; onScheduled?: (until: string) => void }) {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const [owned, setOwned] = useState<OwnedPlace[] | null>(null);
  const [keepReviews, setKeepReviews] = useState<boolean | null>(null);
  const [choices, setChoices] = useState<Record<string, PlaceChoice>>({});
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api(token, "GET").then((d) => setOwned(d.owned_places ?? [])).catch(() => setOwned([]));
  }, [token]);

  const choiceOf = (id: string): PlaceChoice => choices[id] ?? { remove: false, reason: "", details: "" };
  const setChoice = (id: string, patch: Partial<PlaceChoice>) => setChoices((p) => ({ ...p, [id]: { ...choiceOf(id), ...patch } }));
  const placesOk = (owned ?? []).every((p) => {
    const c = choiceOf(p.place_id);
    return !c.remove || (c.reason && (c.reason !== "other" || c.details.trim()));
  });
  const canSubmit = !!token && keepReviews !== null && placesOk && confirm.trim() === CONFIRM_WORD && !busy;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api(token, "POST", {
        confirm: confirm.trim(),
        keep_reviews: keepReviews,
        places: (owned ?? []).map((p) => ({ place_id: p.place_id, ...choiceOf(p.place_id) })),
      });
      onScheduled?.(data.scheduled_for);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[700]" style={{ background: "rgba(15,26,46,.4)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] flex flex-col font-hebrew"
        onClick={(e) => e.stopPropagation()} dir="rtl"
        style={{ background: "#F6F9FE", borderRadius: 28, boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "90vh", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>מחיקת חשבון</h3>
          <button type="button" onClick={onClose} aria-label="סגירה" style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4" style={{ padding: "0 20px 24px", fontSize: 14, lineHeight: 1.55 }}>
          <p style={{ color: "#4A5568", fontSize: 13 }}>
            החשבון יימחק בעוד 30 יום. עד אז אפשר לבטל: פשוט להתחבר שוב ולבחור &quot;ביטול המחיקה&quot;.
            השם, האימייל וההתחברות שלך יימחקו.
          </p>

          <div>
            <span style={labelStyle}>מה לעשות עם ההמלצות שכתבת?</span>
            <label className="flex items-start gap-2 mb-1.5" style={{ cursor: "pointer" }}>
              <input type="radio" name="keep_reviews" checked={keepReviews === false} onChange={() => setKeepReviews(false)} style={{ marginTop: 5, accentColor: "#0A2B6B" }} />
              <span>למחוק אותן עכשיו</span>
            </label>
            <label className="flex items-start gap-2" style={{ cursor: "pointer" }}>
              <input type="radio" name="keep_reviews" checked={keepReviews === true} onChange={() => setKeepReviews(true)} style={{ marginTop: 5, accentColor: "#0A2B6B" }} />
              <span>להשאיר אותן באתר בעילום שם, כדי שימשיכו לעזור לשכנים</span>
            </label>
          </div>

          {owned === null && <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: "#8A95A8" }} />}
          {(owned ?? []).map((p) => {
            const c = choiceOf(p.place_id);
            return (
              <div key={p.place_id} style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 14, padding: 12 }}>
                <span style={labelStyle}>את/ה בעל/ת {p.name}. מה לעשות עם המקום?</span>
                <label className="flex items-center gap-2 mb-1" style={{ cursor: "pointer" }}>
                  <input type="radio" name={`place_${p.place_id}`} checked={!c.remove} onChange={() => setChoice(p.place_id, { remove: false })} style={{ accentColor: "#0A2B6B" }} />
                  להשאיר אותו באתר (הבעלות שלי מסתיימת)
                </label>
                <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                  <input type="radio" name={`place_${p.place_id}`} checked={c.remove} onChange={() => setChoice(p.place_id, { remove: true })} style={{ accentColor: "#0A2B6B" }} />
                  לבקש להסיר אותו מהאתר
                </label>
                {c.remove && (
                  <div className="mt-2 space-y-2">
                    <select value={c.reason} onChange={(e) => setChoice(p.place_id, { reason: e.target.value })} style={inputStyle} className="font-hebrew">
                      <option value="">למה להסיר?</option>
                      {Object.entries(REMOVAL_REASONS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <textarea value={c.details} onChange={(e) => setChoice(p.place_id, { details: e.target.value })} rows={2}
                      placeholder={c.reason === "other" ? "פירוט" : "פירוט (לא חובה)"} style={inputStyle} className="font-hebrew" />
                    <p style={{ fontSize: 12, color: "#8A95A8" }}>המקום יוסתר מהאתר מיד, ואנחנו נבדוק את הבקשה.</p>
                  </div>
                )}
              </div>
            );
          })}

          <div>
            <span style={labelStyle}>כדי לאשר, כתבו <strong>{CONFIRM_WORD}</strong></span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} style={inputStyle} className="font-hebrew" />
          </div>

          {error && (
            <div style={{ fontSize: 12.5, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, padding: "9px 12px" }}>{error}</div>
          )}

          <button type="button" onClick={submit} disabled={!canSubmit}
            className="w-full font-bold flex items-center justify-center"
            style={{ background: "#B42318", color: "#fff", borderRadius: 16, padding: 14, fontSize: 14, border: "none", cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.5 }}>
            {busy ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : "מחיקת החשבון"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small strip shown while the account is scheduled for deletion, with a cancel button. */
export function DeletionScheduledNotice() {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const [until, setUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) { setUntil(null); return; }
    api(token, "GET").then((d) => setUntil(d.request?.scheduled_for ?? null)).catch(() => setUntil(null));
  }, [token]);
  useEffect(() => {
    load();
    // The modal announces a new request so the strip shows without a reload
    window.addEventListener("gmt:account-deletion", load);
    return () => window.removeEventListener("gmt:account-deletion", load);
  }, [load]);

  if (!until || !token) return null;
  const cancel = async () => {
    setBusy(true);
    try { await api(token, "DELETE"); setUntil(null); } catch { /* stays visible */ } finally { setBusy(false); }
  };
  return (
    <div className="fixed top-2 inset-x-2 md:mx-auto md:w-fit z-[650] font-hebrew flex items-center justify-between gap-3" dir="rtl"
      style={{ background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 14, padding: "8px 12px", fontSize: 13, color: "#7A271A", boxShadow: "0 4px 14px rgba(10,43,107,.12)" }}>
      <span>החשבון שלך מתוזמן למחיקה ב-{new Date(until).toLocaleDateString("he-IL")}</span>
      <button type="button" onClick={cancel} disabled={busy}
        style={{ background: "#fff", border: "1px solid #FDA29B", borderRadius: 10, padding: "4px 10px", fontWeight: 700, color: "#B42318", cursor: "pointer", whiteSpace: "nowrap" }}>
        {busy ? "מבטל..." : "ביטול המחיקה"}
      </button>
    </div>
  );
}

/** Announce a new deletion request to the notice strip. */
export function announceAccountDeletion() {
  window.dispatchEvent(new Event("gmt:account-deletion"));
}
