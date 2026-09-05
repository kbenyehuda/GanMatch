"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { useSession } from "@/lib/useSession";
import { publicEnv } from "@/lib/env/public";

function contactEnabledPublic() {
  return publicEnv.NEXT_PUBLIC_CONTACT_REVIEWER_ENABLED;
}

function isEmailLike(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E5E9F0",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  color: "#0F1A2E",
  outline: "none",
  background: "#fff",
};

export function ContactReviewerModal({
  targetId,
  kind = "gan",
  placeName,
  onClose,
}: {
  targetId: string;
  kind?: "gan" | "place";
  placeName?: string | null;
  onClose: () => void;
}) {
  const { user, session } = useSession();
  const enabled = contactEnabledPublic();

  const initialEmail = useMemo(() => user?.email ?? "", [user?.email]);
  const [senderEmail, setSenderEmail] = useState(initialEmail);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setSenderEmail((prev) => (prev.trim() ? prev : initialEmail));
  }, [initialEmail]);

  if (!user) return null;
  const accessToken = session?.access_token ?? null;
  const canSubmit = !sending && enabled && !!accessToken;

  const submit = async () => {
    setError(null);
    setSuccess(false);
    if (!accessToken) {
      setError("אנא המתן… ההתחברות עדיין נטענת.");
      return;
    }
    if (!enabled) {
      setError("אפשרות יצירת קשר אינה זמינה כרגע.");
      return;
    }

    const email = senderEmail.trim();
    const msg = messageText.trim();

    if (!email || !isEmailLike(email)) {
      setError("נא להזין אימייל תקין.");
      return;
    }
    if (!msg) {
      setError("נא לכתוב הודעה.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/contact-reviewer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ targetId, kind, senderEmail: email, messageText: msg }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const m = typeof data?.error === "string" ? data.error : "שגיאה בשליחת ההודעה.";
        throw new Error(m);
      }
      setSuccess(true);
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאה בשליחת ההודעה.");
    } finally {
      setSending(false);
    }
  };

  const title = `שלח הודעה לממליץ${placeName ? ` על ${placeName}` : ""}`;

  const body = (
    <div className="flex-1 overflow-y-auto" style={{ padding: "16px 20px" }}>
      <div className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", lineHeight: 1.5, marginBottom: 14 }}>
        הממליץ יקבל אימייל ויוכל להשיב ישירות לאימייל שתכתבו כאן.
      </div>

      {!enabled && (
        <div className="font-hebrew" style={{ fontSize: 12, color: "#9C7A21", background: "#FBF1D8", border: "1px solid #F0DFA8", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
          אפשרות יצירת קשר אינה זמינה כרגע.
        </div>
      )}
      {!accessToken && (
        <div className="font-hebrew" style={{ fontSize: 12, color: "#4A5568", background: "#F5F6FA", border: "1px solid #E5E9F0", borderRadius: 12, padding: "8px 12px", marginBottom: 12 }}>
          טוען נתוני התחברות…
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label className="font-hebrew font-bold" style={{ fontSize: 11, color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          האימייל שלך (נשלח כ-Reply-To)
        </label>
        <input
          value={senderEmail}
          onChange={(e) => setSenderEmail(e.target.value)}
          type="email"
          className="font-hebrew"
          style={inputStyle}
          placeholder="your@email.com"
        />
      </div>

      <div style={{ marginBottom: 4 }}>
        <label className="font-hebrew font-bold" style={{ fontSize: 11, color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
          הודעה
        </label>
        <textarea
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          rows={5}
          className="font-hebrew resize-none"
          style={{ ...inputStyle, lineHeight: 1.6 }}
          placeholder="כתבו שאלה / פרטים…"
        />
      </div>

      {error && (
        <p className="font-hebrew text-sm" style={{ color: "#C53030", marginTop: 10 }}>{error}</p>
      )}
      {success && (
        <p className="font-hebrew text-sm" style={{ color: "#1D7F4F", marginTop: 10, lineHeight: 1.5 }}>
          ההודעה נשלחה. אם האדם יגיב, התשובה תגיע ישירות למייל שלך —{" "}
          <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{senderEmail.trim()}</span>
        </p>
      )}
    </div>
  );

  const header = (
    <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #E5E9F0" }}>
      <button type="button" onClick={onClose} aria-label="סגור" className="flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer" }}>
        <X style={{ width: 16, height: 16, color: "#4A5568" }} />
      </button>
      <h2 className="font-hebrew font-bold" style={{ fontSize: 15, color: "#0A2B6B", flex: 1, textAlign: "center", padding: "0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title}
      </h2>
      <button type="button" onClick={submit} disabled={!canSubmit}
        className="flex items-center gap-1.5 font-hebrew font-bold"
        style={{ padding: "8px 16px", borderRadius: 12, fontSize: 13, border: "none", cursor: canSubmit ? "pointer" : "not-allowed", background: canSubmit ? "linear-gradient(135deg, #0A2B6B, #1F5BB5)" : "#C5CDD8", color: "#fff", flexShrink: 0 }}>
        {sending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <><Send style={{ width: 13, height: 13 }} />שלח</>}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50" dir="rtl">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(15,26,46,.45)", backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />

      {/* Mobile: bottom sheet */}
      <div
        className="md:hidden absolute left-0 right-0 bottom-0 flex flex-col overflow-hidden"
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 shrink-0">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        {header}
        {body}
        <div className="shrink-0" style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </div>

      {/* Desktop: centered card */}
      <div className="hidden md:flex absolute inset-0 items-center justify-center pointer-events-none">
        <div
          className="pointer-events-auto flex flex-col overflow-hidden"
          style={{ width: "min(480px, 92vw)", maxHeight: "80dvh", background: "#fff", borderRadius: 20, boxShadow: "0 24px 60px rgba(10,43,107,.35)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {body}
        </div>
      </div>
    </div>
  );
}
