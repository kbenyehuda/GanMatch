"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import type { PlaceCategory } from "@/types/places";
import { PLACE_CATEGORY_LABELS, VISIBLE_CATEGORIES } from "@/types/places";
import type { Facet } from "./filter-facets";

const CATEGORY_EMOJI: Partial<Record<PlaceCategory, string>> = {
  kids: "🧸", doctor: "🩺", cosmetics: "💄", cafe: "☕", sport: "⚽", attraction: "🎭", food: "🍴",
};

const MORE_KEY = "__more";

// ─── Category tabs ────────────────────────────────────────────────────────────

/**
 * One category at a time. While a search is active it looks across every category,
 * so a temporary "תוצאות חיפוש" tab is shown selected; tapping a real tab ends the search.
 */
export function CategoryTabs({
  active, searching, onSelect, floating,
}: {
  active: PlaceCategory;
  searching: boolean;
  onSelect: (c: PlaceCategory) => void;
  floating?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="קטגוריה"
      className="flex font-hebrew"
      style={{
        gap: 4, padding: 4, borderRadius: 14,
        background: floating ? "rgba(255,255,255,.96)" : "#EEF2F8",
        boxShadow: floating ? "0 8px 20px rgba(10,43,107,.14)" : undefined,
      }}
    >
      {searching && (
        <div
          role="tab"
          aria-selected
          className="flex items-center justify-center"
          style={{ flex: "1.3 1 0", gap: 5, padding: "8px 6px", borderRadius: 10, background: "#0A2B6B", color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}
        >
          <Search style={{ width: 13, height: 13 }} />
          תוצאות חיפוש
        </div>
      )}
      {VISIBLE_CATEGORIES.map((cat) => {
        const isActive = !searching && cat === active;
        return (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(cat)}
            className="flex items-center justify-center"
            style={{
              flex: "1 1 0", gap: 5, padding: "8px 6px", borderRadius: 10, border: 0, cursor: "pointer",
              fontSize: 13, fontWeight: isActive ? 800 : 600, whiteSpace: "nowrap",
              background: isActive ? "#fff" : "transparent",
              color: isActive ? "#0A2B6B" : "#4A5568",
              boxShadow: isActive ? "0 1px 4px rgba(10,43,107,.12)" : "none",
              transition: "background .15s, color .15s",
            }}
          >
            {!searching && <span aria-hidden style={{ fontSize: 14 }}>{CATEGORY_EMOJI[cat]}</span>}
            {PLACE_CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Filter pills ─────────────────────────────────────────────────────────────

function pillText(f: Facet): string {
  if (f.mode === "toggle" || f.selected.length === 0) return f.label;
  if (f.selected.length > 1) return `${f.label} · ${f.selected.length}`;
  const opt = f.options.find((o) => o.id === f.selected[0]);
  return `${f.label}: ${opt?.label ?? f.selected[0]}`;
}

/**
 * Live-applying filter pills. Desktop opens a small popover under the pill;
 * phone opens a short bottom sheet. Facets without enough data never reach here
 * (see buildFacets), so a category may show no pills at all.
 */
export function FilterPills({
  facets, onChange, onClearAll, variant, resultCount, floating,
}: {
  facets: Facet[];
  onChange: (key: string, values: string[]) => void;
  onClearAll: () => void;
  variant: "desktop" | "phone";
  resultCount: number;
  floating?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openKey]);

  const primary = facets.filter((f) => f.primary);
  const secondary = facets.filter((f) => !f.primary);
  const anySelected = facets.some((f) => f.selected.length > 0);
  if (facets.length === 0) return null;

  const secondaryCount = secondary.reduce((n, f) => n + f.selected.length, 0);
  const open = (key: string, el: HTMLElement) => { setAnchor(el.getBoundingClientRect()); setOpenKey(key); };
  const menuFacets = openKey === MORE_KEY ? secondary : facets.filter((f) => f.key === openKey);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 4, flexShrink: 0, whiteSpace: "nowrap",
    padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: "1px solid", transition: "background .15s, color .15s, border-color .15s",
    background: active ? "#0A2B6B" : "#fff",
    color: active ? "#fff" : "#0F1A2E",
    borderColor: active ? "#0A2B6B" : floating ? "#fff" : "#E5E9F0",
    boxShadow: floating && !active ? "0 2px 8px rgba(10,43,107,.10)" : "none",
  });

  return (
    <>
      <div
        className="flex items-center overflow-x-auto scrollbar-hide font-hebrew"
        style={{ gap: 6, paddingBlock: 2, paddingInlineEnd: 16 }}
      >
        {primary.map((f) => {
          const active = f.selected.length > 0;
          if (f.mode === "toggle") {
            return (
              <button key={f.key} type="button" aria-pressed={active} style={pillStyle(active)}
                onClick={() => onChange(f.key, active ? [] : [f.options[0]?.id ?? "yes"])}>
                {active && <Check style={{ width: 13, height: 13 }} />}
                {f.label}
              </button>
            );
          }
          if (!active) {
            return (
              <button key={f.key} type="button" aria-haspopup="dialog" aria-expanded={openKey === f.key}
                style={pillStyle(false)} onClick={(e) => open(f.key, e.currentTarget)}>
                {pillText(f)}
                <ChevronDown style={{ width: 13, height: 13, opacity: 0.7 }} />
              </button>
            );
          }
          // Active pill: label opens the menu, ✕ clears it in one tap.
          return (
            <div key={f.key} style={{ ...pillStyle(true), padding: 0, gap: 0, cursor: "default" }}>
              <button type="button" aria-haspopup="dialog" aria-expanded={openKey === f.key}
                onClick={(e) => open(f.key, e.currentTarget.parentElement ?? e.currentTarget)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", paddingInlineEnd: 6, background: "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer" }}>
                {pillText(f)}
                <ChevronDown style={{ width: 13, height: 13, opacity: 0.7 }} />
              </button>
              <button type="button" aria-label={`ניקוי ${f.label}`} onClick={() => onChange(f.key, [])}
                style={{ display: "flex", alignItems: "center", padding: "7px 10px", paddingInlineStart: 6, background: "none", border: 0, borderInlineStart: "1px solid rgba(255,255,255,.25)", color: "inherit", cursor: "pointer" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            </div>
          );
        })}
        {secondary.length > 0 && (
          <button type="button" aria-label="סינון נוסף" aria-haspopup="dialog" aria-expanded={openKey === MORE_KEY}
            style={pillStyle(secondaryCount > 0)} onClick={(e) => open(MORE_KEY, e.currentTarget)}>
            <SlidersHorizontal style={{ width: 13, height: 13 }} />
            {secondaryCount > 0 ? `עוד · ${secondaryCount}` : "עוד"}
          </button>
        )}
        {anySelected && (
          <button type="button" onClick={onClearAll}
            style={{
              flexShrink: 0, border: 0, fontSize: 13, fontWeight: 700, color: "#1F5BB5", cursor: "pointer", whiteSpace: "nowrap",
              ...(floating
                ? { background: "#fff", borderRadius: 999, padding: "7px 12px", boxShadow: "0 2px 8px rgba(10,43,107,.10)" }
                : { background: "none", padding: "7px 4px" }),
            }}>
            נקה הכל
          </button>
        )}
      </div>

      {openKey && menuFacets.length > 0 && (
        variant === "desktop" && anchor ? (
          <DesktopPopover anchor={anchor} onClose={() => setOpenKey(null)}>
            <FacetMenuBody facets={menuFacets} onChange={onChange} onPickedSingle={() => setOpenKey(null)} />
          </DesktopPopover>
        ) : (
          <PhoneSheet
            title={openKey === MORE_KEY ? "סינון נוסף" : menuFacets[0].label}
            resultCount={resultCount}
            onClose={() => setOpenKey(null)}
          >
            <FacetMenuBody facets={menuFacets} onChange={onChange} onPickedSingle={() => setOpenKey(null)} />
          </PhoneSheet>
        )
      )}
    </>
  );
}

// ─── Menu body (shared by popover and sheet) ─────────────────────────────────

function FacetMenuBody({
  facets, onChange, onPickedSingle,
}: {
  facets: Facet[];
  onChange: (key: string, values: string[]) => void;
  onPickedSingle: () => void;
}) {
  const showHeadings = facets.length > 1;
  return (
    <div className="font-hebrew">
      {facets.map((f, i) => (
        <div key={f.key} style={{ borderTop: i > 0 ? "1px solid #E5E9F0" : undefined, paddingTop: i > 0 ? 8 : 0, marginTop: i > 0 ? 8 : 0 }}>
          {showHeadings && (
            <div style={{ fontSize: 12, fontWeight: 800, color: "#8A95A8", padding: "4px 10px 6px" }}>{f.label}</div>
          )}
          {f.mode === "single" && (
            <OptionRow label="הכל" checked={f.selected.length === 0} round
              onClick={() => { onChange(f.key, []); if (!showHeadings) onPickedSingle(); }} />
          )}
          {f.options.map((o) => {
            const checked = f.selected.includes(o.id);
            return (
              <OptionRow
                key={o.id}
                label={o.label}
                count={o.count}
                checked={checked}
                round={f.mode === "single"}
                disabled={o.count === 0 && !checked}
                onClick={() => {
                  if (f.mode === "single") {
                    onChange(f.key, checked ? [] : [o.id]);
                    if (!showHeadings) onPickedSingle();
                  } else {
                    onChange(f.key, checked ? f.selected.filter((v) => v !== o.id) : [...f.selected, o.id]);
                  }
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OptionRow({
  label, count, checked, round, disabled, onClick,
}: {
  label: string; count?: number; checked: boolean; round?: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={round ? "radio" : "checkbox"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center text-start"
      style={{
        gap: 10, padding: "10px 10px", borderRadius: 10, border: 0, background: checked ? "#F0F5FD" : "transparent",
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1, fontSize: 14, color: "#0F1A2E",
      }}
    >
      <span
        aria-hidden
        className="flex items-center justify-center shrink-0"
        style={{
          width: 18, height: 18, borderRadius: round ? "50%" : 5,
          border: checked ? "none" : "2px solid #C5CDD8", background: checked ? "#0A2B6B" : "#fff",
        }}
      >
        {checked && <Check style={{ width: 12, height: 12, color: "#fff" }} strokeWidth={3} />}
      </span>
      <span className="flex-1" style={{ fontWeight: checked ? 700 : 500 }}>{label}</span>
      {count != null && <span style={{ fontSize: 12, color: "#8A95A8", fontWeight: 600 }}>{count}</span>}
    </button>
  );
}

// ─── Desktop popover ─────────────────────────────────────────────────────────

const POPOVER_WIDTH = 260;

function DesktopPopover({ anchor, onClose, children }: { anchor: DOMRect; onClose: () => void; children: React.ReactNode }) {
  // The pill row scrolls horizontally, so the popover is fixed-positioned from the
  // pill's measured rect (physical coordinates by necessity) to escape the clipping.
  // RTL: the popover's start (right) edge lines up with the pill's right edge.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const vh = typeof window !== "undefined" ? window.innerHeight : 900;
  const right = Math.min(Math.max(vw - anchor.right, 8), vw - POPOVER_WIDTH - 8);
  const top = anchor.bottom + 6;
  return (
    <div className="fixed inset-0 z-[600]" onClick={onClose}>
      <div
        role="dialog"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="absolute overflow-y-auto"
        style={{
          top, right, width: POPOVER_WIDTH, maxHeight: Math.max(vh - top - 16, 200), padding: 6,
          background: "#fff", borderRadius: 14, border: "1px solid #E5E9F0", boxShadow: "0 12px 30px rgba(10,43,107,.18)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Phone sheet ─────────────────────────────────────────────────────────────

function PhoneSheet({
  title, resultCount, onClose, children,
}: {
  title: string; resultCount: number; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[600]" style={{ background: "rgba(15,26,46,.4)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0 flex flex-col font-hebrew"
        style={{ background: "#fff", borderRadius: "24px 24px 0 0", maxHeight: "70%", boxShadow: "0 -10px 30px rgba(10,43,107,.2)" }}
      >
        <div className="flex justify-center shrink-0" style={{ paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        <div className="flex items-center justify-between shrink-0" style={{ padding: "4px 20px 8px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#0F1A2E" }}>{title}</h3>
          <button type="button" onClick={onClose} aria-label="סגירה"
            style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 10px 8px" }}>{children}</div>
        <div className="shrink-0" style={{ padding: "10px 16px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid #E5E9F0" }}>
          <button type="button" onClick={onClose} className="w-full font-bold"
            style={{ background: "#0A2B6B", color: "#fff", borderRadius: 14, padding: 13, fontSize: 14, border: 0, cursor: "pointer" }}>
            {resultCount === 0 ? "אין תוצאות" : `הצגת ${resultCount} מקומות`}
          </button>
        </div>
      </div>
    </div>
  );
}
