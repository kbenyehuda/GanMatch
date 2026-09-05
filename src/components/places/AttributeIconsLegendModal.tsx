"use client";

import { X, Shield, Camera, Medal, Leaf, Fish } from "lucide-react";
import { DrumstickIcon, PeanutIcon, getLanguageChar } from "@/components/gan/GanAttributeIcons";
import type { SpokenLanguage } from "@/types/places";

const LANGS: SpokenLanguage[] = ["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"];

const ENTRIES: { icon: React.ReactNode; title: string; desc: string }[] = [
  {
    icon: <Shield className="w-4 h-4" />,
    title: 'ממ"ד / מיקלט',
    desc: 'לגן יש חדר מוגן (ממ"ד) או גישה למקלט לשעת חירום.',
  },
  {
    icon: <Camera className="w-4 h-4" />,
    title: "מצלמות",
    desc: 'יש מצלמות אבטחה בשטח הגן. אם כתוב "צפייה מרחוק" — אפשר גם לצפות בשידור החי מהטלפון.',
  },
  {
    icon: <Medal className="w-4 h-4" />,
    title: "עזרה ראשונה",
    desc: "לפחות אחת מהמטפלות/הצוות עברה הכשרה בעזרה ראשונה.",
  },
  {
    icon: <Leaf className="w-4 h-4" />,
    title: "טבעוני",
    desc: "יש אפשרות תפריט טבעוני.",
  },
  {
    icon: <Fish className="w-4 h-4" />,
    title: "צמחוני",
    desc: "יש אפשרות תפריט צמחוני.",
  },
  {
    icon: <DrumstickIcon className="w-4 h-4" />,
    title: "מגיש בשר",
    desc: "התפריט כולל בשר.",
  },
  {
    icon: <PeanutIcon className="w-4 h-4" />,
    title: "ידידותי לאלרגיות",
    desc: "יש התחשבות במגבלות אלרגיה נפוצות (כמו בוטנים).",
  },
];

export function AttributeIconsLegendModal({ onClose }: { onClose: () => void }) {
  const body = (
    <div className="flex-1 overflow-y-auto" style={{ padding: "4px 20px 16px" }}>
      <p className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", lineHeight: 1.5, marginBottom: 14 }}>
        מה כל סמל בפרטי הגן אומר:
      </p>
      <div className="flex flex-col gap-3">
        {ENTRIES.map((e) => (
          <div key={e.title} className="flex items-start gap-3">
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{ width: 30, height: 30, borderRadius: "50%", background: "#E8F0FB", color: "#0A2B6B" }}
            >
              {e.icon}
            </span>
            <div>
              <div className="font-hebrew font-bold" style={{ fontSize: 13, color: "#0A2B6B" }}>{e.title}</div>
              <div className="font-hebrew" style={{ fontSize: 12, color: "#4A5568", lineHeight: 1.45 }}>{e.desc}</div>
            </div>
          </div>
        ))}
        <div className="flex items-start gap-3">
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{ width: 30, height: 30, borderRadius: "50%", background: "#E8F0FB", color: "#0A2B6B" }}
          >
            <span className="text-xs font-bold leading-none">א</span>
          </span>
          <div>
            <div className="font-hebrew font-bold" style={{ fontSize: 13, color: "#0A2B6B" }}>שפות</div>
            <div className="font-hebrew" style={{ fontSize: 12, color: "#4A5568", lineHeight: 1.45 }}>
              איזה שפות הצוות דובר בגן.
            </div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {LANGS.map((lang) => {
                const { char, label, lang: langAttr, fontClass } = getLanguageChar(lang);
                return (
                  <span
                    key={lang}
                    className="font-hebrew inline-flex items-center gap-1"
                    style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 7, background: "#F0F4FA", color: "#4A6A9E" }}
                  >
                    <span lang={langAttr} className={`text-xs font-bold leading-none ${fontClass}`} aria-hidden>{char}</span>
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #E5E9F0" }}>
      <button type="button" onClick={onClose} aria-label="סגור" className="flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer" }}>
        <X style={{ width: 16, height: 16, color: "#4A5568" }} />
      </button>
      <h2 className="font-hebrew font-bold" style={{ fontSize: 15, color: "#0A2B6B", flex: 1, textAlign: "center", padding: "0 8px" }}>
        מה הסמלים אומרים
      </h2>
      <div style={{ width: 32 }} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[700]" dir="rtl">
      <div className="absolute inset-0" style={{ background: "rgba(15,26,46,.45)", backdropFilter: "blur(2px)" }} onClick={onClose} />

      {/* Mobile: bottom sheet */}
      <div
        className="md:hidden absolute left-0 right-0 bottom-0 flex flex-col overflow-hidden"
        style={{ background: "#fff", borderRadius: "20px 20px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "88dvh" }}
        onClick={(e) => e.stopPropagation()}
      >
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
          style={{ width: "min(420px, 92vw)", maxHeight: "80dvh", background: "#fff", borderRadius: 20, boxShadow: "0 24px 60px rgba(10,43,107,.35)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {header}
          {body}
        </div>
      </div>
    </div>
  );
}
