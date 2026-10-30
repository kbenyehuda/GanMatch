"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const VIDEO_SRC = "/video/givemytime-intro.mp4";
const POSTER_SRC = "/video/givemytime-intro.jpg";

/** The 45-second "how it works" promo (vertical 9:16, no sound). Mounted only after a tap, so it can start playing. */
export function IntroVideoModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center"
      style={{ background: "rgba(6,20,52,.82)", padding: "56px 16px 24px" }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="איך זה עובד"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="סגירת הסרטון"
        className="absolute flex items-center justify-center"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 12px)", insetInlineEnd: 12,
          width: 40, height: 40, borderRadius: "50%", border: "none",
          background: "rgba(255,255,255,.16)", color: "#fff", cursor: "pointer",
        }}
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      <video
        src={VIDEO_SRC}
        poster={POSTER_SRC}
        controls
        playsInline
        muted
        autoPlay
        preload="none"
        style={{
          height: "100%", maxHeight: 960, width: "auto", maxWidth: "100%",
          aspectRatio: "9 / 16", objectFit: "contain",
          borderRadius: 18, background: "#0A2B6B", boxShadow: "0 24px 60px rgba(0,0,0,.45)",
        }}
      />
    </div>
  );
}
