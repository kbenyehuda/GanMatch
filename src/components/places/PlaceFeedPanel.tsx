"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, SlidersHorizontal, ChevronDown, Loader2 } from "lucide-react";
import type { Place, PlaceCategory, NeighborhoodGivatayim, KosherStatus } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS, PLACE_CATEGORY_LABELS, NEIGHBORHOOD_LABELS,
} from "@/types/places";
import type { PlaceFilters } from "@/types/place-filters";
import { DEFAULT_PLACE_FILTERS } from "@/types/place-filters";
import { searchPlaces } from "@/lib/places-api";
import { PlaceCard } from "./PlaceCard";
import { useSession } from "@/lib/useSession";

// ─── Constants ────────────────────────────────────────────────────────────────

type SortOption = "top" | "rating" | "nearest" | "newest";

const SORT_OPTIONS: { id: SortOption; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "top", label: "מומלצים", sub: "מותאם לשכונה שלך", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
    </svg>
  )},
  { id: "rating", label: "דירוג גבוה", sub: "הציונים הטובים ביותר", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
      <path d="M20 7l-8 8-4-4-6 6"/><path d="M14 7h6v6"/>
    </svg>
  )},
  { id: "nearest", label: "הכי קרובים", sub: "הכי קרוב אליך", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
      <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>
    </svg>
  )},
  { id: "newest", label: "חדשים", sub: "נוספו לאחרונה", icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  )},
];

const ALL_CATEGORIES: PlaceCategory[] = ["doctor", "cafe", "kids", "sport", "attraction", "food", "cosmetics"];

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧸", sport: "⚽", attraction: "🎭", food: "🍴", cosmetics: "💄",
};

const HMO_LIST = [
  { id: "maccabi",  label: "מכבי",   logo: "/hmo/maccabi.png"  },
  { id: "clalit",   label: "כללית",  logo: "/hmo/clalit.png"   },
  { id: "meuhedet", label: "מאוחדת", logo: "/hmo/meuhedet.png" },
  { id: "leumit",   label: "לאומית", logo: "/hmo/leumit.png"   },
];

const ALL_NEIGHBORHOODS: NeighborhoodGivatayim[] = ["BOROCHOV","ARLOZOROV","GIVAT_RAMBAM","KIRYAT_YOSEF","SHEINKIN","KOZLOVSKY","HATEKUMA","BEN_GURION"];

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortPlaces(places: Place[], sort: SortOption, userLoc: { lon: number; lat: number } | null): Place[] {
  const arr = [...places];
  switch (sort) {
    case "rating": return arr.sort((a, b) => (b.avg_rating ?? -1) - (a.avg_rating ?? -1));
    case "nearest":
      if (!userLoc) return arr;
      return arr.sort((a, b) => Math.hypot(a.lat - userLoc.lat, a.lon - userLoc.lon) - Math.hypot(b.lat - userLoc.lat, b.lon - userLoc.lon));
    case "newest": return arr; // rely on server order
    case "top":
    default:
      return arr.sort((a, b) => (b.avg_rating ?? 0) * Math.log1p(b.rec_count) - (a.avg_rating ?? 0) * Math.log1p(a.rec_count));
  }
}

// ─── Greeting ─────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב,";
  if (h < 17) return "צהריים טובים,";
  return "ערב טוב,";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlaceFeedPanelProps {
  places: Place[];
  selectedPlaceId: string | null;
  onSelectPlace: (place: Place) => void;
  filters: PlaceFilters;
  onFiltersChange: (f: PlaceFilters) => void;
  userLocation?: { lon: number; lat: number } | null;
  isVisible: boolean;
  savedIds?: Set<string>;
  onToggleSave?: (id: string) => void;
  /** Lifted search query — shared with map tab search. When provided, replaces internal state. */
  searchQuery?: string;
  onSearchQueryChange?: (q: string) => void;
  onGoProfile?: () => void;
}

// ─── Sort bottom sheet ────────────────────────────────────────────────────────

function SortSheet({ sort, onSelect, onClose }: { sort: SortOption; onSelect: (s: SortOption) => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: "rgba(15,26,46,.4)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{ background: "#F6F9FE", borderRadius: "28px 28px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "55%" }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-2">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3">
          <h3 className="font-hebrew" style={{ fontSize: 20, fontWeight: 800 }}>מיין לפי</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        {/* Options */}
        <div style={{ padding: "0 20px 32px", overflowY: "auto" }}>
          {SORT_OPTIONS.map((opt, i) => (
            <button key={opt.id} type="button" onClick={() => { onSelect(opt.id); onClose(); }}
              className="w-full text-start flex items-center gap-3.5"
              style={{ padding: "16px 4px", borderTop: i > 0 ? "1px solid #E5E9F0" : "none", background: "none", border: i > 0 ? undefined : "none", borderTopColor: "#E5E9F0", cursor: "pointer" }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: "#E8F0FB", color: "#0A2B6B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {opt.icon}
              </div>
              <div className="flex-1">
                <strong className="font-hebrew block" style={{ fontWeight: 700, fontSize: 14, color: "#0F1A2E" }}>{opt.label}</strong>
                <span className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>{opt.sub}</span>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: "50%", border: sort === opt.id ? "none" : "2px solid #E5E9F0", background: sort === opt.id ? "#0A2B6B" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {sort === opt.id && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" style={{ width: 12, height: 12 }}>
                    <path d="M5 12l5 5L20 7"/>
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Filter bottom sheet ──────────────────────────────────────────────────────

export function FilterSheet({
  filters, places, onApply, onClose,
}: {
  filters: PlaceFilters;
  places: Place[];
  onApply: (f: PlaceFilters) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<PlaceFilters>({ ...filters });

  const toggleCat = (cat: PlaceCategory) => {
    const cur = pending.categories ?? [];
    const next = cur.includes(cat) ? cur.filter(c => c !== cat) : [...cur, cat];
    setPending({ ...pending, categories: next.length ? next : null });
  };
  const toggleHmo = (id: string) => {
    const cur = pending.hmo ?? [];
    const next = cur.includes(id) ? cur.filter(h => h !== id) : [...cur, id];
    setPending({ ...pending, hmo: next.length ? next : null });
  };
  const toggleNeighborhood = (n: NeighborhoodGivatayim) => {
    const cur = pending.neighborhoods ?? [];
    const next = cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n];
    setPending({ ...pending, neighborhoods: next.length ? next : null });
  };
  const toggleKosher = (k: KosherStatus) => {
    const cur = pending.kosher ?? [];
    const next = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k];
    setPending({ ...pending, kosher: next.length ? next : null });
  };
  const togglePrice = (p: 1 | 2 | 3) => {
    const cur = pending.price_range ?? [];
    const next = cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p];
    setPending({ ...pending, price_range: next.length ? next : null });
  };

  const count = useMemo(() => {
    return places.filter(p => {
      if (pending.categories?.length && !pending.categories.includes(p.place_category)) return false;
      if (pending.hmo?.length && !p.hmo?.some(h => pending.hmo!.includes(h))) return false;
      if (pending.neighborhoods?.length && (!p.neighborhood || !pending.neighborhoods.includes(p.neighborhood))) return false;
      if (pending.kosher?.length && (!p.kosher || !pending.kosher.includes(p.kosher))) return false;
      if (pending.price_range?.length && (!p.price_range || !pending.price_range.includes(p.price_range as 1|2|3))) return false;
      return true;
    }).length;
  }, [places, pending]);

  return (
    <div className="fixed inset-0 z-50" style={{ background: "rgba(15,26,46,.4)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="absolute left-0 right-0 bottom-0 flex flex-col"
        style={{ background: "#F6F9FE", borderRadius: "28px 28px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "88%", overflow: "hidden" }}
        onClick={e => e.stopPropagation()} dir="rtl">
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-2 shrink-0">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 className="font-hebrew" style={{ fontSize: 20, fontWeight: 800 }}>פילטרים</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 20px" }}>
          {/* Category */}
          <div style={{ paddingTop: 16, paddingBottom: 16 }}>
            <div className="font-hebrew" style={{ fontSize: 11, fontWeight: 800, color: "#8A95A8", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>קטגוריה</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map(cat => {
                const active = pending.categories?.includes(cat) ?? false;
                return (
                  <button key={cat} type="button" onClick={() => toggleCat(cat)}
                    className="flex items-center gap-1.5 font-hebrew"
                    style={{ padding: "9px 14px", borderRadius: 12, background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568", border: "1px solid", borderColor: active ? "#0A2B6B" : "#E5E9F0", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
                    <span style={{ fontSize: 14 }}>{CATEGORY_EMOJI[cat]}</span>
                    {PLACE_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>
          {/* HMO */}
          <div style={{ paddingTop: 16, paddingBottom: 16, borderTop: "1px solid #E5E9F0" }}>
            <div className="font-hebrew" style={{ fontSize: 11, fontWeight: 800, color: "#8A95A8", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>קופת חולים</div>
            <div className="grid grid-cols-2 gap-2">
              {HMO_LIST.map(hmo => {
                const active = pending.hmo?.includes(hmo.id) ?? false;
                return (
                  <button key={hmo.id} type="button" onClick={() => toggleHmo(hmo.id)}
                    className="flex flex-col items-center font-hebrew"
                    style={{ border: `1.5px solid ${active ? "#0A2B6B" : "#E5E9F0"}`, borderRadius: 14, padding: "10px 8px", background: active ? "#E8F0FB" : "#fff", cursor: "pointer", transition: "all .15s" }}>
                    <img src={hmo.logo} alt={hmo.label} style={{ width: "100%", height: 36, objectFit: "contain" }} />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Neighborhood */}
          <div style={{ paddingTop: 16, paddingBottom: 16, borderTop: "1px solid #E5E9F0" }}>
            <div className="font-hebrew" style={{ fontSize: 11, fontWeight: 800, color: "#8A95A8", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>שכונה</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_NEIGHBORHOODS.map(n => {
                const active = pending.neighborhoods?.includes(n) ?? false;
                return (
                  <button key={n} type="button" onClick={() => toggleNeighborhood(n)}
                    className="font-hebrew"
                    style={{ padding: "9px 14px", borderRadius: 12, background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568", border: "1px solid", borderColor: active ? "#0A2B6B" : "#E5E9F0", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
                    {NEIGHBORHOOD_LABELS[n]}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Kosher */}
          <div style={{ paddingTop: 16, paddingBottom: 16, borderTop: "1px solid #E5E9F0" }}>
            <div className="font-hebrew" style={{ fontSize: 11, fontWeight: 800, color: "#8A95A8", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>כשרות</div>
            <div className="flex flex-wrap gap-1.5">
              {([["CERTIFIED", "כשר"], ["NOT_CERTIFIED", "לא כשר"]] as [KosherStatus, string][]).map(([k, label]) => {
                const active = pending.kosher?.includes(k) ?? false;
                return (
                  <button key={k} type="button" onClick={() => toggleKosher(k)}
                    className="font-hebrew"
                    style={{ padding: "9px 14px", borderRadius: 12, background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568", border: "1px solid", borderColor: active ? "#0A2B6B" : "#E5E9F0", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Price range */}
          <div style={{ paddingTop: 16, paddingBottom: 24, borderTop: "1px solid #E5E9F0" }}>
            <div className="font-hebrew" style={{ fontSize: 11, fontWeight: 800, color: "#8A95A8", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 12 }}>מחיר</div>
            <div className="flex flex-wrap gap-1.5">
              {([1, 2, 3] as (1|2|3)[]).map(p => {
                const label = "₪".repeat(p);
                const active = pending.price_range?.includes(p) ?? false;
                return (
                  <button key={p} type="button" onClick={() => togglePrice(p)}
                    className="font-hebrew"
                    style={{ padding: "9px 18px", borderRadius: 12, background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568", border: "1px solid", borderColor: active ? "#0A2B6B" : "#E5E9F0", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all .15s", letterSpacing: ".05em" }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="shrink-0 flex gap-2.5" style={{ padding: "14px 18px calc(86px + env(safe-area-inset-bottom, 0px))", background: "linear-gradient(180deg,transparent,#F6F9FE 30%)" }}>
          <button type="button" onClick={() => { setPending({ ...DEFAULT_PLACE_FILTERS }); onApply({ ...DEFAULT_PLACE_FILTERS }); onClose(); }}
            className="font-hebrew font-bold" style={{ flex: "0 0 35%", background: "#fff", border: "1px solid #E5E9F0", borderRadius: 16, padding: 14, fontSize: 14, color: "#4A5568", cursor: "pointer" }}>
            נקה הכל
          </button>
          <button type="button" onClick={() => { onApply(pending); onClose(); }}
            disabled={count === 0}
            className="flex-1 flex items-center justify-center gap-2 font-hebrew font-bold"
            style={{ background: count === 0 ? "#C5CDD8" : "#0A2B6B", color: "#fff", borderRadius: 16, padding: 14, fontSize: 14, border: "none", cursor: count === 0 ? "not-allowed" : "pointer" }}>
            {count === 0 ? "אין תוצאות" : `הצג ${count} מקומות`}
            {count > 0 && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}><path d="M5 12h14M13 5l7 7-7 7"/></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlaceFeedPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  filters,
  onFiltersChange,
  userLocation = null,
  isVisible,
  savedIds = new Set(),
  onToggleSave,
  searchQuery: externalSearchQuery,
  onSearchQueryChange,
  onGoProfile,
}: PlaceFeedPanelProps) {
  const { user } = useSession();
  const [sort, setSort] = useState<SortOption>("top");
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = externalSearchQuery ?? internalSearchQuery;
  const setSearchQuery = (q: string) => {
    setInternalSearchQuery(q);
    onSearchQueryChange?.(q);
  };
  const [apiSearchResults, setApiSearchResults] = useState<Place[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const greeting = useMemo(() => getGreeting(), []);
  const userInitial = user?.email?.[0]?.toUpperCase() ?? "א";

  // Search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.trim().length < 2) { setApiSearchResults(null); setSearchLoading(false); return; }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(searchQuery.trim(), { limit: 30 });
        setApiSearchResults(results as Place[]);
      } catch { setApiSearchResults(null); }
      finally { setSearchLoading(false); }
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  const visiblePlaces = useMemo(() => {
    if (apiSearchResults !== null) return sortPlaces(apiSearchResults, sort, userLocation);
    let result = places;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.name.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q));
    }
    return sortPlaces(result, sort, userLocation);
  }, [places, sort, searchQuery, apiSearchResults, userLocation]);

  const featuredPlace = useMemo(() => visiblePlaces.find(p => p.avg_rating != null) ?? null, [visiblePlaces]);

  const activeFilterCount =
    (filters.categories?.length ?? 0) +
    (filters.neighborhoods?.length ?? 0) +
    (filters.hmo?.length ?? 0) +
    (filters.kosher?.length ?? 0) +
    (filters.price_range?.length ?? 0);

  const toggleCategory = (cat: PlaceCategory) => {
    const current = filters.categories ?? [];
    const next = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
    onFiltersChange({ ...filters, categories: next.length ? next : null });
  };

  if (!isVisible) return null;

  return (
    <div className="flex flex-col h-full" style={{ background: "#F6F9FE" }} dir="rtl">

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", flexShrink: 0, padding: "6px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="GiveMyTime" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", boxShadow: "0 2px 8px rgba(10,43,107,.12)" }} />
          <div className="font-hebrew" style={{ fontSize: 17, fontWeight: 800, color: "#0A2B6B" }}>{greeting}</div>
        </div>
        <button
          type="button"
          onClick={onGoProfile}
          className="flex items-center justify-center font-hebrew font-bold shrink-0"
          style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#E59A2C,#C8A24B)", color: "#fff", fontSize: 13, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(10,43,107,.06)", cursor: onGoProfile ? "pointer" : "default" }}
        >
          {userInitial}
        </button>
      </div>

      {/* ── Search + filter ──────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "0 20px 12px", display: "flex", gap: 8, flexShrink: 0 }}>
        <div className="relative flex-1">
          <Search className="absolute pointer-events-none" style={{ width: 16, height: 16, color: "#8A95A8", top: "50%", transform: "translateY(-50%)", insetInlineStart: 14 }} />
          <input
            type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="חיפוש מקומות..." className="w-full font-hebrew"
            style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 14, padding: "11px 14px", paddingInlineStart: 40, fontSize: 14, color: "#0F1A2E", boxShadow: "0 1px 3px rgba(10,43,107,.04)", outline: "none", transition: "border-color .2s, box-shadow .2s" }}
            onFocus={e => { e.target.style.borderColor = "#1F5BB5"; e.target.style.boxShadow = "0 0 0 3px rgba(31,91,181,.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E5E9F0"; e.target.style.boxShadow = "0 1px 3px rgba(10,43,107,.04)"; }}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} className="absolute" style={{ insetInlineEnd: 12, top: "50%", transform: "translateY(-50%)", color: "#8A95A8", background: "none", border: 0, cursor: "pointer" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
        {/* Filter button */}
        <button type="button" onClick={() => setShowFilterSheet(true)}
          className="relative flex items-center justify-center"
          style={{ width: 44, height: 44, borderRadius: 14, background: "#fff", border: "1px solid #E5E9F0", color: "#0A2B6B", cursor: "pointer", boxShadow: "0 1px 3px rgba(10,43,107,.04)", flexShrink: 0 }}>
          <SlidersHorizontal style={{ width: 16, height: 16 }} />
          {activeFilterCount > 0 && (
            <span className="absolute flex items-center justify-center" style={{ top: -4, insetInlineEnd: -4, width: 18, height: 18, borderRadius: "50%", background: "#C8A24B", fontSize: 10, fontWeight: 800, color: "#fff", border: "2px solid #F6F9FE" }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Category chips ───────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", padding: "0 20px 14px", gap: 8, flexShrink: 0, background: "#fff" }}>
        {ALL_CATEGORIES.map(cat => {
          const active = filters.categories?.includes(cat) ?? false;
          return (
            <button key={cat} type="button" onClick={() => toggleCategory(cat)} aria-pressed={active}
              className="flex items-center font-hebrew"
              style={{ gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer", border: "1px solid", transition: "background .15s, color .15s, border-color .15s", background: active ? "#0A2B6B" : "#fff", color: active ? "#fff" : "#4A5568", borderColor: active ? "#0A2B6B" : "#E5E9F0" }}>
              <span style={{ fontSize: 13 }}>{CATEGORY_EMOJI[cat]}</span>
              {PLACE_CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* ── Scrollable feed ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide" style={{ padding: "0 20px 96px" }}>

        {/* Section head */}
        <div style={{ margin: "6px 0 12px" }}>
          <div className="flex items-center justify-between">
            <h3 className="font-hebrew flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 800, color: "#0F1A2E", letterSpacing: ".02em" }}>
              {apiSearchResults !== null ? "תוצאות חיפוש" : "המלצות קרוב אליך"}
              {searchLoading ? (
                <Loader2 style={{ width: 12, height: 12, color: "#8A95A8" }} className="animate-spin" />
              ) : visiblePlaces.length > 0 && (
                <span style={{ color: "#8A95A8", fontWeight: 500 }}>({visiblePlaces.length})</span>
              )}
            </h3>
            {/* Sort button */}
            <button type="button" onClick={() => setShowSortSheet(true)}
              className="flex items-center gap-1 font-hebrew"
              style={{ fontSize: 12, fontWeight: 700, color: "#1F5BB5", background: "none", border: 0, cursor: "pointer", padding: "4px 0" }}>
              {SORT_OPTIONS.find(o => o.id === sort)?.label ?? "מומלצים"}
              <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {visiblePlaces.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#E8F0FB", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#1F5BB5" }}>
              <Search style={{ width: 24, height: 24 }} />
            </div>
            <h4 className="font-hebrew font-bold" style={{ fontSize: 18, color: "#0F1A2E", marginBottom: 4 }}>לא נמצאו מקומות</h4>
            <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8", lineHeight: 1.5 }}>נסו לשנות את הפילטרים או להזיז את המפה</p>
          </div>
        ) : (
          <>
            {/* Featured card */}
            {featuredPlace && sort === "top" && apiSearchResults === null && (
              <PlaceCard
                place={featuredPlace}
                isSelected={selectedPlaceId === featuredPlace.id}
                onSelect={onSelectPlace}
                userLocation={userLocation}
                featured
                isSaved={savedIds.has(featuredPlace.id)}
                onToggleSave={onToggleSave}
              />
            )}
            {/* Regular cards */}
            {visiblePlaces
              .filter(p => !(sort === "top" && apiSearchResults === null && p.id === featuredPlace?.id))
              .map(place => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  isSelected={selectedPlaceId === place.id}
                  onSelect={onSelectPlace}
                  userLocation={userLocation}
                  isSaved={savedIds.has(place.id)}
                  onToggleSave={onToggleSave}
                />
              ))}
          </>
        )}
      </div>

      {/* ── Sort sheet ───────────────────────────────────────────────────────── */}
      {showSortSheet && (
        <SortSheet sort={sort} onSelect={setSort} onClose={() => setShowSortSheet(false)} />
      )}

      {/* ── Filter sheet ─────────────────────────────────────────────────────── */}
      {showFilterSheet && (
        <FilterSheet
          filters={filters}
          places={places}
          onApply={onFiltersChange}
          onClose={() => setShowFilterSheet(false)}
        />
      )}
    </div>
  );
}
