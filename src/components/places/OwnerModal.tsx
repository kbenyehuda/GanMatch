"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Place } from "@/types/places";
import { useSession } from "@/lib/useSession";
import { REMOVAL_REASONS } from "@/lib/place-basic-details";

type ClaimStatus = "pending" | "approved" | "declined" | "revoked";
type View = "main" | "edit" | "remove";

interface OwnerModalProps {
  place: Place;
  onClose: () => void;
  onPlaceUpdated?: (place: Place) => void;
  onShowToast?: (msg: string) => void;
  /** Opens the full gan-details editor in owner mode (kids places). */
  onEditKidsDetails: () => void;
  /** Opens the pin-move flow. */
  onRequestLocationChange?: () => void;
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid #E5E9F0", background: "#fff", fontSize: 14,
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#4A5568", marginBottom: 4, display: "block" };
const primaryBtn: React.CSSProperties = {
  background: "#0A2B6B", color: "#fff", borderRadius: 16, padding: 14, fontSize: 14, border: "none", cursor: "pointer", width: "100%",
};
const secondaryBtn: React.CSSProperties = {
  background: "#fff", color: "#0A2B6B", borderRadius: 16, padding: 13, fontSize: 14, border: "1px solid #E5E9F0", cursor: "pointer", width: "100%",
};

const HMO_OPTS = [
  { value: "maccabi", label: "מכבי" }, { value: "clalit", label: "כללית" },
  { value: "meuhedet", label: "מאוחדת" }, { value: "leumit", label: "לאומית" },
];

/**
 * "זה העסק שלכם?" (decisions 2026-11-07): ask to be the owner (verified by phone, no documents),
 * then edit every detail live, or ask for the listing to be removed (only the admin removes).
 */
export function OwnerModal({ place, onClose, onPlaceUpdated, onShowToast, onEditKidsDetails, onRequestLocationChange }: OwnerModalProps) {
  const { session } = useSession();
  const token = session?.access_token ?? null;
  const [status, setStatus] = useState<ClaimStatus | null | "loading">("loading");
  const [view, setView] = useState<View>("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Request form
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [accepted, setAccepted] = useState(false);

  // Edit form
  const a = (place.attributes ?? {}) as Record<string, unknown>;
  const [name, setName] = useState(place.name);
  const [address, setAddress] = useState(place.address ?? "");
  const [phones, setPhones] = useState((place.phone ?? []).join(", "));
  const [website, setWebsite] = useState(place.website ?? "");
  const [hours, setHours] = useState(place.hours ?? "");
  const [description, setDescription] = useState(place.description ?? "");
  const [specialty, setSpecialty] = useState(typeof a.specialty === "string" ? a.specialty : "");
  const [hmo, setHmo] = useState<string[]>(place.hmo ?? []);

  // Removal
  const [removeReason, setRemoveReason] = useState("");
  const [removeNote, setRemoveNote] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`/api/places/owner?place_id=${encodeURIComponent(place.id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive) setStatus((d?.claim?.status as ClaimStatus) ?? null); })
      .catch(() => { if (alive) setStatus(null); });
    return () => { alive = false; };
  }, [token, place.id]);

  const post = async (url: string, body: Record<string, unknown>) => {
    if (!token) throw new Error("נדרשת התחברות.");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ place_id: place.id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");
    return data;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "שגיאה"); } finally { setBusy(false); }
  };

  const submitClaim = () => run(async () => {
    await post("/api/places/owner", { full_name: fullName, role, phone, note, accepted_rules: accepted });
    setStatus("pending");
  });

  const submitEdit = () => run(async () => {
    const body: Record<string, unknown> = {
      name, address, website, hours, description,
      phone: phones.split(/[,;]/).map((p) => p.trim()).filter(Boolean),
    };
    if (place.place_category === "doctor" || place.place_category === "cosmetics") body.specialty = specialty;
    if (place.place_category === "doctor") body.hmo = hmo;
    const data = await post("/api/places/owner/edit", body);
    if (data.place) onPlaceUpdated?.({ ...place, ...data.place });
    onShowToast?.("השינויים נשמרו ומופיעים באתר");
    setView("main");
  });

  const submitRemove = () => run(async () => {
    const data = await post("/api/places/owner/edit", { remove_listing: true, reason: removeReason, details: removeNote });
    if (data.hidden) onShowToast?.("המקום הוסתר מהאתר. נבדוק את הבקשה ונחזור אליך");
    onClose();
  });

  const title = status === "approved" ? (view === "edit" ? "עריכת פרטים" : view === "remove" ? "בקשה להסרת הרישום" : "המקום שלכם") : "זה העסק שלכם?";

  return (
    <div className="fixed inset-0 z-[600]" style={{ background: "rgba(15,26,46,.4)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="absolute left-0 right-0 bottom-0 flex flex-col" onClick={(e) => e.stopPropagation()} dir="rtl"
        style={{ background: "#F6F9FE", borderRadius: "28px 28px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "90%", overflow: "hidden" }}>
        <div className="flex justify-center pt-2.5 pb-2 shrink-0">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 className="font-hebrew" style={{ fontSize: 18, fontWeight: 800 }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="סגירה" style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto font-hebrew" style={{ padding: "0 20px calc(90px + env(safe-area-inset-bottom, 0px))", fontSize: 14, lineHeight: 1.55 }}>
          {status === "loading" && (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ width: 20, height: 20, color: "#8A95A8" }} /></div>
          )}

          {status === "pending" && (
            <div style={{ background: "#fff", borderRadius: 16, padding: 16, border: "1px solid #E5E9F0" }}>
              <p style={{ fontWeight: 700, marginBottom: 6 }}>הבקשה התקבלה, נחזור אליך</p>
              <p style={{ color: "#4A5568", fontSize: 13 }}>
                נתקשר או נשלח וואטסאפ למספר שמופיע אצלנו ברישום של {place.name}, כדי לוודא שזה באמת העסק שלך.
                בינתיים אפשר לעדכן פרטים כמו כל אחד, והעדכון ייבדק לפני שיופיע.
              </p>
            </div>
          )}

          {(status === null || status === "declined" || status === "revoked") && (
            <div className="space-y-3">
              {status === "declined" && (
                <p style={{ background: "#FEF3F2", color: "#B42318", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}>
                  הבקשה הקודמת לא אושרה. אפשר לשלוח בקשה חדשה.
                </p>
              )}
              <p style={{ color: "#4A5568", fontSize: 13 }}>
                בעלי מקומות יכולים לעדכן את כל הפרטים של המקום, והשינויים מופיעים מיד. כדי לוודא שזה באמת העסק שלך,
                נתקשר או נשלח וואטסאפ למספר שמופיע ברישום. לא צריך לשלוח מסמכים.
              </p>
              <div>
                <label style={labelStyle}>שם מלא</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={inputStyle} className="font-hebrew" />
              </div>
              <div>
                <label style={labelStyle}>תפקיד (לא חובה)</label>
                <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="בעלת הגן, מנהל המרפאה..." style={inputStyle} className="font-hebrew" />
              </div>
              <div>
                <label style={labelStyle}>טלפון לחזרה</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="050-0000000" style={inputStyle} className="font-hebrew" />
              </div>
              <div>
                <label style={labelStyle}>משהו שכדאי שנדע? (לא חובה)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={inputStyle} className="font-hebrew"
                  placeholder="למשל: המספר ברישום לא נכון, המספר הנכון הוא..." />
              </div>
              <label className="flex items-start gap-2" style={{ fontSize: 12.5, color: "#4A5568", cursor: "pointer" }}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 3, accentColor: "#0A2B6B" }} />
                <span>
                  אני בעל/ת המקום או מורשה מטעמו. ידוע לי שבכל הודעה ועדכון שאשלח מהחשבון הזה, האתר יציין אוטומטית
                  שאני בעל/ת המקום, ושלפי{" "}
                  <a href="/terms" target="_blank" style={{ color: "#1F5BB5", fontWeight: 700 }}>תנאי השימוש</a>{" "}
                  אסור לשלוח הודעות או לעדכן פרטים בלי שיהיה ברור שאני בעל/ת מקום באתר, למשל מחשבון אחר.
                </span>
              </label>
              <button type="button" onClick={submitClaim} disabled={busy || !fullName.trim() || !phone.trim() || !accepted}
                className="font-hebrew font-bold flex items-center justify-center"
                style={{ ...primaryBtn, opacity: busy || !fullName.trim() || !phone.trim() || !accepted ? 0.5 : 1 }}>
                {busy ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : "שליחת הבקשה"}
              </button>
            </div>
          )}

          {status === "approved" && view === "main" && (
            <div className="space-y-2.5">
              <p style={{ background: "#DCF3E6", color: "#1D7F4F", borderRadius: 12, padding: "10px 12px", fontWeight: 700 }}>
                את/ה בעל/ת {place.name}. שינויים שתעשו יופיעו באתר מיד.
              </p>
              <p style={{ color: "#4A5568", fontSize: 12.5 }}>
                בכל הודעה ועדכון שתשלחו מהחשבון הזה, האתר מציין אוטומטית שאתם בעלי המקום. לפי כללי האתר,
                אסור לשלוח הודעות או לעדכן פרטים בלי שיהיה ברור שאתם בעלי מקום, למשל מחשבון אחר.
              </p>
              <button type="button" className="font-hebrew font-bold" style={primaryBtn} onClick={() => setView("edit")}>עריכת פרטים</button>
              {place.place_category === "kids" && (
                <button type="button" className="font-hebrew font-bold" style={secondaryBtn} onClick={onEditKidsDetails}>עריכת פרטי הגן</button>
              )}
              {onRequestLocationChange && (
                <button type="button" className="font-hebrew font-bold" style={secondaryBtn} onClick={() => { onClose(); onRequestLocationChange(); }}>תיקון המיקום במפה</button>
              )}
              <button type="button" className="font-hebrew" onClick={() => setView("remove")}
                style={{ ...secondaryBtn, color: "#B42318", fontWeight: 600, border: "none", background: "none" }}>
                בקשה להסרת הרישום
              </button>
            </div>
          )}

          {status === "approved" && view === "edit" && (
            <div className="space-y-3">
              <div><label style={labelStyle}>שם</label><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} className="font-hebrew" /></div>
              <div>
                <label style={labelStyle}>כתובת</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} className="font-hebrew" />
                <span style={{ fontSize: 11.5, color: "#8A95A8" }}>שינוי הכתובת לא מזיז את הסיכה במפה. לזה יש &quot;תיקון המיקום במפה&quot;.</span>
              </div>
              <div><label style={labelStyle}>טלפון (כמה מספרים: מופרדים בפסיק)</label><input value={phones} onChange={(e) => setPhones(e.target.value)} inputMode="tel" style={inputStyle} className="font-hebrew" /></div>
              <div><label style={labelStyle}>אתר</label><input value={website} onChange={(e) => setWebsite(e.target.value)} inputMode="url" dir="ltr" style={inputStyle} /></div>
              <div><label style={labelStyle}>שעות פעילות</label><input value={hours} onChange={(e) => setHours(e.target.value)} placeholder="א'-ה' 07:30–16:00" style={inputStyle} className="font-hebrew" /></div>
              {(place.place_category === "doctor" || place.place_category === "cosmetics") && (
                <div><label style={labelStyle}>{place.place_category === "doctor" ? "תחום התמחות" : "סוג הטיפול"}</label><input value={specialty} onChange={(e) => setSpecialty(e.target.value)} style={inputStyle} className="font-hebrew" /></div>
              )}
              {place.place_category === "doctor" && (
                <div>
                  <label style={labelStyle}>קופות חולים</label>
                  <div className="flex flex-wrap gap-3">
                    {HMO_OPTS.map((o) => (
                      <label key={o.value} className="flex items-center gap-1.5" style={{ fontSize: 13, cursor: "pointer" }}>
                        <input type="checkbox" checked={hmo.includes(o.value)} style={{ accentColor: "#0A2B6B" }}
                          onChange={() => setHmo((p) => (p.includes(o.value) ? p.filter((x) => x !== o.value) : [...p, o.value]))} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div><label style={labelStyle}>תיאור</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={inputStyle} className="font-hebrew" /></div>
              <div className="flex gap-2.5">
                <button type="button" className="font-hebrew font-bold" style={{ ...secondaryBtn, flex: "0 0 30%" }} onClick={() => setView("main")} disabled={busy}>חזרה</button>
                <button type="button" className="font-hebrew font-bold flex items-center justify-center" style={primaryBtn} onClick={submitEdit} disabled={busy || !name.trim()}>
                  {busy ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : "שמירה"}
                </button>
              </div>
            </div>
          )}

          {status === "approved" && view === "remove" && (
            <div className="space-y-3">
              <p style={{ color: "#4A5568", fontSize: 13 }}>
                המקום יוסתר מהאתר מיד, ואנחנו נבדוק את הבקשה ונחזור אליך. המידע לא נמחק.
                אם משהו בפרטים לא נכון, אפשר גם פשוט לתקן אותו.
              </p>
              <div>
                <label style={labelStyle}>למה להסיר?</label>
                <div className="space-y-1.5">
                  {Object.entries(REMOVAL_REASONS).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2" style={{ fontSize: 13.5, cursor: "pointer" }}>
                      <input type="radio" name="remove_reason" checked={removeReason === value} onChange={() => setRemoveReason(value)} style={{ accentColor: "#0A2B6B" }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>{removeReason === "other" ? "פירוט" : "פירוט (לא חובה)"}</label>
                <textarea value={removeNote} onChange={(e) => setRemoveNote(e.target.value)} rows={3} style={inputStyle} className="font-hebrew" />
              </div>
              <div className="flex gap-2.5">
                <button type="button" className="font-hebrew font-bold" style={{ ...secondaryBtn, flex: "0 0 30%" }} onClick={() => setView("main")} disabled={busy}>חזרה</button>
                <button type="button" className="font-hebrew font-bold flex items-center justify-center" style={{ ...primaryBtn, background: "#B42318" }} onClick={submitRemove} disabled={busy || !removeReason || (removeReason === "other" && !removeNote.trim())}>
                  {busy ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : "שליחת בקשה להסרה"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, fontSize: 12.5, color: "#B42318", background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 10, padding: "9px 12px" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
