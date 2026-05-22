"use client";

import { useState, useCallback, useRef } from "react";

// ─── Component ────────────────────────────────────────────────────────────────

export function Toast({ text, visible }: { text: string; visible: boolean }) {
  return (
    <div
      dir="rtl"
      style={{
        position: "fixed",
        bottom: "calc(92px + env(safe-area-inset-bottom, 0px))",
        left: "50%",
        transform: visible
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(16px)",
        background: "#0F1A2E",
        color: "#fff",
        padding: "11px 18px",
        borderRadius: 14,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 24px rgba(10,43,107,.18)",
        zIndex: 9999,
        opacity: visible ? 1 : 0,
        pointerEvents: "none",
        transition: "transform .3s cubic-bezier(.22,1,.36,1), opacity .2s ease",
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: "90%",
        whiteSpace: "nowrap",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2EA86B" strokeWidth="2.5">
        <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
      </svg>
      {text}
    </div>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setText(msg);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 2200);
  }, []);

  return { text, visible, showToast };
}
