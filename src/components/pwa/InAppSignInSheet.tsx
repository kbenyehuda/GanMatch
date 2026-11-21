"use client";

import { useEffect, useState } from "react";
import { onInAppSignInBlocked, signInWithGoogle } from "@/lib/sign-in";
import { track } from "@/lib/analytics";
import { phoneKind } from "@/lib/install-prompt";

/**
 * Shown when someone taps "sign in" inside Facebook / Instagram / WhatsApp's built-in browser.
 * Google often refuses to sign in there, so we ask them to open the page in the real browser
 * (one tap on Android, copy-link on iPhone). "Try here anyway" still works for the cases that do.
 */
export function InAppSignInSheet() {
  const [open, setOpen] = useState(false);
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const [kind, setKind] = useState<"ios" | "android" | "other">("other");

  useEffect(() => onInAppSignInBlocked(({ returnTo: r }) => {
    setReturnTo(r);
    setCopied(false);
    setKind(phoneKind());
    setOpen(true);
  }), []);

  if (!open) return null;

  const url = typeof window !== "undefined" ? window.location.href : "";
  const intentUrl = typeof window !== "undefined"
    ? `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;package=com.android.chrome;end`
    : "#";

  const copy = async () => {
    track("inapp_sheet_copy", { kind }, null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: show the link so a long-press can copy it
      window.prompt("העתיקו את הקישור:", url);
    }
  };

  const primary = { padding: "12px 16px", borderRadius: 14, background: "linear-gradient(135deg,#0A2B6B,#1F5BB5)", color: "#fff", border: "none", fontSize: 15, cursor: "pointer" } as const;
  const secondary = { padding: "12px 16px", borderRadius: 14, background: "#fff", color: "#0A2B6B", border: "1.5px solid #C7D2E6", fontSize: 15, cursor: "pointer" } as const;

  return (
    <div className="fixed inset-0 flex items-end justify-center" dir="rtl" style={{ zIndex: 200, background: "rgba(10,20,40,.55)" }}
      onClick={() => setOpen(false)}>
      <div className="font-hebrew w-full" onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 460, background: "#fff", borderRadius: "22px 22px 0 0", padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))", boxShadow: "0 -12px 40px rgba(10,43,107,.25)" }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0A2B6B" }}>כדי להתחבר, פתחו בדפדפן הרגיל</div>
        <p style={{ fontSize: 14, color: "#4A5568", lineHeight: 1.6, marginTop: 8 }}>
          הדפדפן שבתוך פייסבוק / וואטסאפ לא תמיד מאפשר התחברות עם Google. בדפדפן הרגיל זה לוקח כמה שניות.
        </p>
        <div className="flex flex-col gap-2.5" style={{ marginTop: 14 }}>
          {kind === "android" && (
            <a href={intentUrl} onClick={() => track("inapp_sheet_open_chrome", { kind }, null)}
              className="text-center font-bold" style={{ ...primary, textDecoration: "none" }}>
              פתיחה ב-Chrome
            </a>
          )}
          <button type="button" onClick={copy} className="font-bold" style={kind === "android" ? secondary : primary}>
            {copied ? "הקישור הועתק ✓" : "העתקת קישור"}
          </button>
          {copied && (
            <p style={{ fontSize: 13, color: "#4A5568", lineHeight: 1.5, margin: 0 }}>
              עכשיו פותחים {kind === "ios" ? "את Safari" : "את הדפדפן"} ומדביקים בשורת הכתובת.
            </p>
          )}
          <button type="button"
            onClick={() => { track("inapp_sheet_try_anyway", { kind }, null); setOpen(false); void signInWithGoogle(returnTo, { force: true }); }}
            style={{ background: "none", border: 0, color: "#6B7A99", fontSize: 13, textDecoration: "underline", cursor: "pointer", padding: 4 }}>
            לנסות להתחבר כאן בכל זאת
          </button>
        </div>
      </div>
    </div>
  );
}
