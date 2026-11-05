"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { useBackClose } from "@/lib/back-stack";

export interface NoPinNoticeProps {
  /** Places in the current category and filters that have no pin. */
  count: number;
  /** How many of them are ganim (kids only; shown as "מהם N גנים" when the list mixes types). */
  ganimCount?: number;
  /** The list is about ganim only, so say "גנים" instead of "מקומות". */
  ganimOnly?: boolean;
  /** Picks "ללא מיקום על המפה" in the "מיקום" filter. */
  onShow: () => void;
}

/** "יש עוד 43 מקומות ללא מיקום על המפה, מהם 25 גנים" */
function noticeText({ count, ganimCount = 0, ganimOnly = false }: NoPinNoticeProps): string {
  const what = ganimOnly
    ? (count === 1 ? "גן אחד" : `${count} גנים`)
    : (count === 1 ? "מקום אחד" : `${count} מקומות`);
  const ganim = !ganimOnly && ganimCount > 0 ? `, ${ganimCount === 1 ? "מהם גן אחד" : `מהם ${ganimCount} גנים`}` : "";
  return `יש עוד ${what} ללא מיקום על המפה${ganim}`;
}

const showButtonStyle: React.CSSProperties = {
  background: "#0A2B6B", color: "#fff", border: 0, borderRadius: 10, padding: "6px 12px",
  fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
};

/** Phone: a small "+43" chip; tapping it explains and offers to show them. */
export function NoPinChip(props: NoPinNoticeProps) {
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));
  if (props.count === 0) return null;
  return (
    <div className="relative self-start font-hebrew" dir="rtl" style={{ pointerEvents: "auto" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={noticeText(props)}
        className="flex items-center gap-1 font-bold"
        style={{
          background: "#FBF1D8", color: "#7A5E14", border: "1px solid #F0DFAE", borderRadius: 999,
          padding: "4px 10px", fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(10,43,107,.12)",
        }}
      >
        <MapPin style={{ width: 12, height: 12 }} />
        <span dir="ltr">+{props.count}</span>
      </button>
      {open && (
        <div
          className="absolute flex flex-col gap-2"
          style={{
            top: "calc(100% + 6px)", insetInlineStart: 0, width: 250, zIndex: 5,
            background: "#fff", borderRadius: 14, padding: "10px 12px", border: "1px solid #E5E9F0",
            boxShadow: "0 12px 30px rgba(10,43,107,.18)",
          }}
        >
          <div className="flex items-start gap-2">
            <span className="flex-1" style={{ fontSize: 13, fontWeight: 700, color: "#0F1A2E", lineHeight: 1.4 }}>
              {noticeText(props)}
            </span>
            <button type="button" aria-label="סגירה" onClick={() => setOpen(false)}
              style={{ background: "none", border: 0, color: "#8A95A8", cursor: "pointer", padding: 0, lineHeight: 0 }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <span style={{ fontSize: 12, color: "#4A5568", lineHeight: 1.45 }}>
            יש להם כתובת, אבל עוד לא סימנו אותם על המפה. הם מופיעים ברשימה.
          </span>
          <button type="button" onClick={() => { setOpen(false); props.onShow(); }} className="font-bold self-start" style={showButtonStyle}>
            הצגה ברשימה
          </button>
        </div>
      )}
    </div>
  );
}
