"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export const SKIP_LOGIN_STORAGE_KEY = "ganmatch_skip_login";

export function ConnectionGate({
  onSkip,
  loading = false,
}: {
  onSkip?: () => void;
  loading?: boolean;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const canAuth = !!supabase;

  const signIn = async () => {
    if (!supabase) return;
    setSigningIn(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] w-full flex flex-col"
      dir="rtl"
      style={{ background: "linear-gradient(160deg, #0A2B6B 0%, #1F5BB5 60%, #3E7BD9 100%)" }}
    >
      {/* Gold radial glow */}
      <div className="pointer-events-none fixed inset-0" style={{ background: "radial-gradient(500px 400px at 80% 10%, rgba(200,162,75,.25), transparent 70%)" }} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">

        {/* Logo / brand mark */}
        <div className="flex flex-col items-center mb-10">
          {/* App icon */}
          <img
            src="/app-icon.png"
            alt="GiveMyTime"
            style={{ width: 180, height: 180, borderRadius: 44, boxShadow: "0 12px 36px rgba(10,43,107,.4)", marginBottom: 20, objectFit: "cover" }}
          />

          <p className="font-hebrew" style={{ fontSize: 14, color: "rgba(255,255,255,.65)", marginTop: 6, textAlign: "center", lineHeight: 1.6, maxWidth: 260 }}>
            גלו מקומות, שירותים ועסקים מומלצים בגבעתיים
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full"
          style={{ maxWidth: 360, background: "rgba(255,255,255,.97)", borderRadius: 24, padding: "28px 24px", boxShadow: "0 24px 60px rgba(10,43,107,.3)" }}
        >
          <h2 className="font-hebrew" style={{ fontSize: 18, fontWeight: 800, color: "#0A2B6B", marginBottom: 6 }}>
            ברוכים הבאים
          </h2>
          <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8", marginBottom: 24, lineHeight: 1.6 }}>
            {loading ? "טוען התחברות…" : "התחברו כדי לכתוב המלצות ולשמור מקומות."}
          </p>

          {!canAuth && (
            <div className="font-hebrew" style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
              Supabase לא מוגדר — אפשר להמשיך כאורח.
            </div>
          )}

          {/* Google sign-in */}
          <button
            type="button"
            onClick={signIn}
            disabled={loading || signingIn || !canAuth}
            className="w-full font-hebrew flex items-center justify-center gap-3"
            style={{
              padding: "14px 20px", borderRadius: 14, border: "1.5px solid #E5E9F0",
              background: loading || signingIn ? "#F6F9FE" : "#fff",
              color: "#0F1A2E", fontSize: 15, fontWeight: 700,
              cursor: loading || signingIn || !canAuth ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(10,43,107,.06)",
              transition: "all .15s",
              marginBottom: 12,
              opacity: loading || signingIn || !canAuth ? 0.6 : 1,
            }}
          >
            {/* Google "G" icon */}
            <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {signingIn ? "מתחבר…" : "התחברות עם Google"}
          </button>

          {/* Skip */}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={loading}
              className="w-full font-hebrew"
              style={{
                padding: "13px 20px", borderRadius: 14,
                background: "#F6F9FE", border: "none",
                color: "#4A5568", fontSize: 14, fontWeight: 600,
                cursor: "pointer", transition: "background .15s",
              }}
            >
              המשך כאורח
            </button>
          )}
        </div>

        {/* Footer note */}
        <p className="font-hebrew" style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 24, textAlign: "center", lineHeight: 1.6 }}>
          במצב אורח חלק מהפעולות מוגבלות.
          <br />
          ניתן להתחבר בכל עת.
          <br />
          בהתחברות אתם מסכימים ל
          <Link href="/privacy" style={{ color: "rgba(255,255,255,.75)", textDecoration: "underline" }}>
            מדיניות הפרטיות ותנאי השימוש
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
