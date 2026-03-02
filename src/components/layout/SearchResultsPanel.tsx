"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import type { Gan } from "@/types/ganim";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import { formatGanCategoryAddonLabelHe, formatGanCategoryHe } from "@/lib/gan-display";

interface SearchResultsPanelProps {
  ganim: Gan[];
  selectedGanId: string | null;
  onSelectGan: (gan: Gan) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onMobileOpenChange?: (open: boolean) => void;
}

export function SearchResultsPanel({
  ganim,
  selectedGanId,
  onSelectGan,
  searchQuery,
  onSearchChange,
  isMobileOpen = false,
  onCloseMobile,
  onMobileOpenChange,
}: SearchResultsPanelProps) {
  const PEEK_HEIGHT_PX = 56;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const ignoreNextClickRef = useRef(false);
  const translateYRef = useRef<number | null>(null);
  const dragRef = useRef<{
    kind: "pointer" | "touch";
    pointerId?: number;
    touchId?: number;
    startY: number;
    startTranslateY: number;
    closedTranslateY: number;
    moved: boolean;
  } | null>(null);

  const [translateY, setTranslateY] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    translateYRef.current = translateY;
  }, [translateY]);

  const computeClosedTranslateY = () => {
    const el = sheetRef.current;
    if (!el) return 0;
    const h = el.getBoundingClientRect().height;
    return Math.max(0, h - PEEK_HEIGHT_PX);
  };

  // Sync translate state when open/closed changes.
  useEffect(() => {
    const closed = computeClosedTranslateY();
    setTranslateY(isMobileOpen ? 0 : closed);
  }, [isMobileOpen]);

  // Recompute closed position on resize/orientation changes.
  useEffect(() => {
    const onResize = () => {
      if (dragging) return;
      const closed = computeClosedTranslateY();
      setTranslateY(isMobileOpen ? 0 : closed);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dragging, isMobileOpen]);

  const requestOpenChange = (open: boolean) => {
    onMobileOpenChange?.(open);
    if (!open) onCloseMobile?.();
  };

  const toggleMobile = () => requestOpenChange(!isMobileOpen);

  const startDrag = (kind: "pointer" | "touch", startY: number, ids: { pointerId?: number; touchId?: number }) => {
    const closed = computeClosedTranslateY();
    const start = translateYRef.current ?? (isMobileOpen ? 0 : closed);
    dragRef.current = {
      kind,
      pointerId: ids.pointerId,
      touchId: ids.touchId,
      startY,
      startTranslateY: start,
      closedTranslateY: closed,
      moved: false,
    };
    setDragging(true);
  };

  const moveDrag = (y: number) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = y - d.startY;
    if (Math.abs(dy) > 6) d.moved = true;
    const next = Math.max(0, Math.min(d.closedTranslateY, d.startTranslateY + dy));
    setTranslateY(next);
  };

  const endDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    const current = translateYRef.current ?? d.startTranslateY;
    const shouldOpen = current < d.closedTranslateY * 0.5;
    requestOpenChange(shouldOpen);
    setTranslateY(shouldOpen ? 0 : d.closedTranslateY);
    ignoreNextClickRef.current = true;
    dragRef.current = null;
    setDragging(false);
  };

  const cancelDrag = () => {
    const d = dragRef.current;
    if (!d) return;
    requestOpenChange(isMobileOpen);
    setTranslateY(isMobileOpen ? 0 : d.closedTranslateY);
    ignoreNextClickRef.current = true;
    dragRef.current = null;
    setDragging(false);
  };

  const sheetTransform = useMemo(() => {
    if (translateY === null) return undefined;
    return `translateY(${translateY}px)`;
  }, [translateY]);

  const content = (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-4 border-b border-gan-accent/30 shrink-0">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="חיפוש גנים לפי עיר או כתובת..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pe-10 ps-10 py-2 rounded-lg border border-gan-accent/50 focus:outline-none focus:ring-2 focus:ring-gan-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-3">
        {ganim.length === 0 ? (
          <p className="text-center text-gray-500 py-8 font-hebrew">
            לא נמצאו גנים באזור. נסה להזיז את המפה או להרחיב את החיפוש.
          </p>
        ) : (
          ganim.map((gan) => (
            (() => {
              const showUnapproved = !gan.is_verified;
              const pikuachText =
                gan.metadata?.pikuach_ironi === true
                  ? "קיים"
                  : gan.metadata?.pikuach_ironi === false
                    ? "לא קיים"
                    : null;
              const neighborhood = getGanNeighborhoodForDisplay(gan);
              const addon = formatGanCategoryAddonLabelHe(gan);

              return (
            <Card
              key={gan.id}
              className={`cursor-pointer transition-colors hover:border-gan-primary ${
                selectedGanId === gan.id ? "border-gan-primary ring-2 ring-gan-primary/30" : ""
              }`}
              onClick={() => onSelectGan(gan)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gan-dark font-hebrew">{gan.name_he}</h3>
                  {showUnapproved ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                      נוסף לאחרונה ע״י משתמש — עדיין לא אושר
                    </span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <StarRating value={gan.avg_rating} count={gan.recommendation_count} />
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                    כתובת
                  </dt>
                  <dd className="text-gray-600 font-hebrew">
                    {getGanStreetAddressForDisplay(gan)}
                  </dd>
                  <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">עיר</dt>
                  <dd className="text-gray-600 font-hebrew">{getGanCityForDisplay(gan)}</dd>
                  {neighborhood ? (
                    <>
                      <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">שכונה</dt>
                      <dd className="text-gray-600 font-hebrew">{neighborhood}</dd>
                    </>
                  ) : null}
                  <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סוג</dt>
                  <dd className="text-gray-600 font-hebrew">{formatGanCategoryHe(gan.category)}</dd>
                  {addon ? (
                    <>
                      <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">{addon.label}</dt>
                      <dd className="text-gray-600 font-hebrew">{addon.value}</dd>
                    </>
                  ) : null}
                  {pikuachText ? (
                    <>
                      <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">פיקוח עירוני</dt>
                      <dd className="text-gray-600 font-hebrew">{pikuachText}</dd>
                    </>
                  ) : null}
                </dl>
              </CardContent>
            </Card>
              );
            })()
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Side panel */}
      <div className="hidden md:flex md:w-96 md:flex-shrink-0 md:h-full bg-white/95 backdrop-blur shadow-lg flex-col overflow-hidden min-h-0">
        <div className="px-4 py-3 border-b border-gan-accent/30 shrink-0">
          <h2 className="font-hebrew font-semibold text-gan-dark">חיפוש גנים</h2>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {content}
        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      <div
        id="mobile-search-panel"
        ref={sheetRef}
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl ${
          dragging ? "" : "transition-transform duration-300"
        }`}
        style={sheetTransform ? { transform: sheetTransform } : undefined}
      >
        <button
          type="button"
          className="w-full flex flex-col items-center pt-2 pb-1 select-none touch-none"
          aria-label={isMobileOpen ? "סגור חיפוש" : "פתח חיפוש"}
          aria-expanded={isMobileOpen}
          onClick={() => {
            if (ignoreNextClickRef.current) {
              ignoreNextClickRef.current = false;
              return;
            }
            // If a drag just happened, ignore the click.
            if (dragRef.current?.moved) return;
            toggleMobile();
          }}
          onPointerDown={(e) => {
            const el = sheetRef.current;
            if (!el) return;
            startDrag("pointer", e.clientY, { pointerId: e.pointerId });
            try {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            } catch {
              // ignore
            }

            const onMove = (ev: PointerEvent) => {
              if (dragRef.current?.kind !== "pointer") return;
              if (dragRef.current?.pointerId !== ev.pointerId) return;
              moveDrag(ev.clientY);
            };
            const onUp = (ev: PointerEvent) => {
              if (dragRef.current?.kind !== "pointer") return;
              if (dragRef.current?.pointerId !== ev.pointerId) return;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", onCancel);
              endDrag();
            };
            const onCancel = (ev: PointerEvent) => {
              if (dragRef.current?.kind !== "pointer") return;
              if (dragRef.current?.pointerId !== ev.pointerId) return;
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              window.removeEventListener("pointercancel", onCancel);
              cancelDrag();
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
            window.addEventListener("pointercancel", onCancel);
          }}
          onTouchStart={(e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            startDrag("touch", t.clientY, { touchId: t.identifier });
          }}
          onTouchMove={(e) => {
            const d = dragRef.current;
            if (!d || d.kind !== "touch") return;
            const t = Array.from(e.touches).find((x) => x.identifier === d.touchId);
            if (!t) return;
            moveDrag(t.clientY);
          }}
          onTouchEnd={() => {
            if (dragRef.current?.kind !== "touch") return;
            endDrag();
          }}
          onTouchCancel={() => {
            if (dragRef.current?.kind !== "touch") return;
            cancelDrag();
          }}
        >
          <div className="w-12 h-1 rounded-full bg-gray-300" />
          <div className="mt-1 text-xs font-hebrew text-gray-600">
            {isMobileOpen ? "גרור מטה לסגירה" : "גרור למעלה לפתיחה"}
          </div>
        </button>
        <div className="h-[60vh] overflow-hidden flex flex-col min-h-0 pb-[env(safe-area-inset-bottom)]">
          <div className="px-4 py-2 border-b shrink-0">
            <h2 className="font-hebrew font-semibold text-gan-dark">חיפוש גנים</h2>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {content}
          </div>
        </div>
      </div>
    </>
  );
}
