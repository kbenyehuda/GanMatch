"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, ChevronDown, Loader2, LogOut, LogIn } from "lucide-react";
import type { Place, PlaceCategory } from "@/types/places";
import { searchPlaces } from "@/lib/places-api";
import { PlaceCard } from "./PlaceCard";
import { CategoryTabs, FilterPills } from "./CategoryFilterBar";
import type { Facet } from "./filter-facets";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import { signInWithGoogle } from "@/lib/sign-in";

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

// ─── Sort ─────────────────────────────────────────────────────────────────────

function sortPlaces(places: Place[], sort: SortOption, userLoc: { lon: number; lat: number } | null): Place[] {
  const arr = [...places];
  switch (sort) {
    case "rating": return arr.sort((a, b) => (b.avg_rating ?? -1) - (a.avg_rating ?? -1));
    case "nearest":
      if (!userLoc) return arr;
      return arr.sort((a, b) => {
        const da = a.lat != null && a.lon != null ? Math.hypot(a.lat - userLoc.lat, a.lon - userLoc.lon) : Infinity;
        const db = b.lat != null && b.lon != null ? Math.hypot(b.lat - userLoc.lat, b.lon - userLoc.lon) : Infinity;
        return da - db;
      });
    case "newest": return arr; // rely on server order
    case "top":
    default: {
      return arr.sort((a, b) => {
        const ra = a.avg_rating ?? -1;
        const rb = b.avg_rating ?? -1;
        if (rb !== ra) return rb - ra;
        return b.rec_count - a.rec_count;
      });
    }
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
  /** Desktop: hovering a card marks the place on the map (null when the pointer leaves). */
  onHoverPlace?: (placeId: string | null) => void;
  /** The one category shown (search ignores it and looks across all). */
  category: PlaceCategory;
  onSelectCategory: (c: PlaceCategory) => void;
  facets: Facet[];
  onFacetChange: (key: string, values: string[]) => void;
  onClearFilters: () => void;
  /** Desktop opens filter popovers under the pills; phone opens short bottom sheets. */
  variant: "desktop" | "phone";
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
        className="absolute left-0 right-0 bottom-0 flex flex-col overflow-hidden"
        style={{ background: "#F6F9FE", borderRadius: "28px 28px 0 0", boxShadow: "0 -10px 30px rgba(10,43,107,.2)", maxHeight: "55%" }}
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-2 shrink-0">
          <div style={{ width: 42, height: 5, borderRadius: 99, background: "#E5E9F0" }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h3 className="font-hebrew" style={{ fontSize: 20, fontWeight: 800 }}>מיין לפי</h3>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#E8F0FB", border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X style={{ width: 14, height: 14, color: "#0A2B6B" }} />
          </button>
        </div>
        {/* Options */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "0 20px 32px" }}>
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

// ─── Main component ───────────────────────────────────────────────────────────

export function PlaceFeedPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  onHoverPlace,
  category,
  onSelectCategory,
  facets,
  onFacetChange,
  onClearFilters,
  variant,
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
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const greeting = useMemo(() => getGreeting(), []);
  const userInitial = user?.email?.[0]?.toUpperCase() ?? "א";

  const handleSignIn = () => signInWithGoogle();
  const handleSignOut = async () => {
    setShowProfileMenu(false);
    if (!supabase) return;
    await supabase.auth.signOut();
  };

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

  const searching = searchQuery.trim() !== "";

  if (!isVisible) return null;

  return (
    <div className="flex flex-col h-full" style={{ background: "#F6F9FE" }} dir="rtl">

      {/* ── Topbar ──────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", flexShrink: 0, padding: "6px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="GiveMyTime" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", boxShadow: "0 2px 8px rgba(10,43,107,.12)" }} />
          <div className="font-hebrew" style={{ fontSize: 17, fontWeight: 800, color: "#0A2B6B" }}>{greeting}</div>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => (onGoProfile ? onGoProfile() : setShowProfileMenu(v => !v))}
            className="flex items-center justify-center font-hebrew font-bold shrink-0"
            style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#E59A2C,#C8A24B)", color: "#fff", fontSize: 13, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(10,43,107,.06)", cursor: "pointer" }}
          >
            {userInitial}
          </button>

          {/* Desktop profile menu (mobile navigates to a full ProfileScreen via onGoProfile instead) */}
          {!onGoProfile && showProfileMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
              <div
                className="absolute z-50 font-hebrew"
                style={{ insetInlineEnd: 0, top: "calc(100% + 8px)", width: 230, background: "#fff", borderRadius: 16, boxShadow: "0 12px 30px rgba(10,43,107,.18)", border: "1px solid #E5E9F0", overflow: "hidden" }}
              >
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E9F0" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F1A2E", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user?.email ?? "מצב אורח"}
                  </div>
                </div>
                {user ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center"
                    style={{ gap: 8, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#E53E3E", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <LogOut style={{ width: 16, height: 16 }} />
                    התנתקות
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSignIn}
                    className="w-full flex items-center"
                    style={{ gap: 8, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#0A2B6B", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <LogIn style={{ width: 16, height: 16 }} />
                    התחברות עם Google
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Search ───────────────────────────────────────────────────────────── */}
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
      </div>

      {/* ── Category tabs + filter pills ─────────────────────────────────────── */}
      <div style={{ padding: "0 20px 12px", flexShrink: 0, background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
        <CategoryTabs
          active={category}
          searching={searching}
          onSelect={(c) => { if (searching) setSearchQuery(""); onSelectCategory(c); }}
        />
        {!searching && (
          <FilterPills
            facets={facets}
            onChange={onFacetChange}
            onClearAll={onClearFilters}
            variant={variant}
            resultCount={visiblePlaces.length}
          />
        )}
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
            {/* The top-rated place is simply first in the list (sort "top"), with no special card */}
            {visiblePlaces
              .map(place => (
                <div key={place.id} onMouseEnter={() => onHoverPlace?.(place.id)} onMouseLeave={() => onHoverPlace?.(null)}>
                  <PlaceCard
                    place={place}
                    isSelected={selectedPlaceId === place.id}
                    onSelect={onSelectPlace}
                    userLocation={userLocation}
                    isSaved={savedIds.has(place.id)}
                    onToggleSave={onToggleSave}
                  />
                </div>
              ))}
          </>
        )}
      </div>

      {/* ── Sort sheet ───────────────────────────────────────────────────────── */}
      {showSortSheet && (
        <SortSheet sort={sort} onSelect={setSort} onClose={() => setShowSortSheet(false)} />
      )}

    </div>
  );
}
