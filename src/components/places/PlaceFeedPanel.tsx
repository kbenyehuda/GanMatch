"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, SlidersHorizontal, ChevronDown, Loader2, MapPin } from "lucide-react";
import { AuthButton } from "@/components/auth/AuthButton";
import type { Place, PlaceCategory } from "@/types/places";
import { PLACE_CATEGORY_COLORS, PLACE_CATEGORY_LABELS } from "@/types/places";
import type { PlaceFilters } from "@/types/place-filters";
import { searchPlaces } from "@/lib/places-api";
import { PlaceCard } from "./PlaceCard";

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortOption = "top" | "rating" | "nearest" | "newest";

const SORT_LABELS: Record<SortOption, string> = {
  top: "מומלצים",
  rating: "דירוג גבוה",
  nearest: "הכי קרובים",
  newest: "חדשים",
};

function sortPlaces(
  places: Place[],
  sort: SortOption,
  userLoc: { lon: number; lat: number } | null
): Place[] {
  const arr = [...places];
  switch (sort) {
    case "rating":
      return arr.sort((a, b) => (b.avg_rating ?? -1) - (a.avg_rating ?? -1));
    case "nearest":
      if (!userLoc) return arr;
      return arr.sort((a, b) => {
        const da = Math.hypot(a.lat - userLoc.lat, a.lon - userLoc.lon);
        const db = Math.hypot(b.lat - userLoc.lat, b.lon - userLoc.lon);
        return da - db;
      });
    case "top":
    default:
      return arr.sort(
        (a, b) =>
          (b.avg_rating ?? 0) * Math.log1p(b.rec_count) -
          (a.avg_rating ?? 0) * Math.log1p(a.rec_count)
      );
  }
}

// ─── Category chips config ────────────────────────────────────────────────────

const ALL_CATEGORIES: PlaceCategory[] = [
  "doctor", "cafe", "kids", "wellness", "attraction", "food",
];

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧩",
  wellness: "🧘", attraction: "🎡", food: "🍽️",
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface PlaceFeedPanelProps {
  places: Place[];
  selectedPlaceId: string | null;
  onSelectPlace: (place: Place) => void;
  filters: PlaceFilters;
  onFiltersChange: (f: PlaceFilters) => void;
  userLocation?: { lon: number; lat: number } | null;
  isVisible: boolean;
}

export function PlaceFeedPanel({
  places,
  selectedPlaceId,
  onSelectPlace,
  filters,
  onFiltersChange,
  userLocation = null,
  isVisible,
}: PlaceFeedPanelProps) {
  const [sort, setSort] = useState<SortOption>("top");
  const [searchQuery, setSearchQuery] = useState("");
  const [apiSearchResults, setApiSearchResults] = useState<Place[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search API call — fires when query ≥ 2 chars
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (searchQuery.trim().length < 2) {
      setApiSearchResults(null);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(searchQuery.trim(), { limit: 30 });
        setApiSearchResults(results as Place[]);
      } catch {
        setApiSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  const visiblePlaces = useMemo(() => {
    // Use API search results when available; fall back to local viewport filter
    if (apiSearchResults !== null) {
      return sortPlaces(apiSearchResults, sort, userLocation);
    }
    let result = places;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.address?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }
    return sortPlaces(result, sort, userLocation);
  }, [places, sort, searchQuery, apiSearchResults, userLocation]);

  const featuredPlace = useMemo(
    () => visiblePlaces.find((p) => p.avg_rating != null) ?? null,
    [visiblePlaces]
  );

  const activeFilterCount =
    (filters.categories?.length ?? 0) +
    (filters.neighborhoods?.length ?? 0) +
    (filters.kosher?.length ?? 0) +
    (filters.price_range?.length ?? 0) +
    (filters.hmo?.length ?? 0);

  const toggleCategory = (cat: PlaceCategory) => {
    const current = filters.categories ?? [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    onFiltersChange({ ...filters, categories: next.length ? next : null });
  };

  if (!isVisible) return null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#F6F9FE", overflow: "hidden" }}
      dir="rtl"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: "14px 16px 12px", flexShrink: 0 }}>
        <div className="flex items-center justify-between gap-2">
          {/* City name */}
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin style={{ width: 15, height: 15, color: "#1F5BB5", flexShrink: 0 }} />
            <span
              className="font-hebrew font-bold truncate"
              style={{ fontSize: 18, color: "#0A2B6B", fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif", lineHeight: 1 }}
            >
              גבעתיים
            </span>
          </div>

          {/* Auth */}
          <AuthButton />
        </div>
      </div>

      {/* ── Search + filter button ──────────────────────────────────────────── */}
      <div
        style={{ background: "#fff", padding: "0 20px 12px", display: "flex", gap: 10, flexShrink: 0 }}
      >
        {/* Search bar */}
        <div className="relative flex-1">
          <Search
            className="absolute pointer-events-none"
            style={{ width: 16, height: 16, color: "#8A95A8", top: "50%", transform: "translateY(-50%)", insetInlineStart: 14 }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש מקומות..."
            className="w-full font-hebrew"
            style={{
              background: "#fff", border: "1px solid #E5E9F0", borderRadius: 14,
              padding: "11px 14px", paddingInlineStart: 40,
              fontSize: 14, color: "#0F1A2E",
              boxShadow: "0 1px 3px rgba(10,43,107,.04)",
              outline: "none",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#1F5BB5";
              e.target.style.boxShadow = "0 0 0 3px rgba(31,91,181,.12)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#E5E9F0";
              e.target.style.boxShadow = "0 1px 3px rgba(10,43,107,.04)";
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute"
              style={{ insetInlineEnd: 12, top: "50%", transform: "translateY(-50%)", color: "#8A95A8" }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
        {/* Filter button */}
        <button
          type="button"
          className="relative flex items-center justify-center"
          style={{
            width: 44, height: 44, borderRadius: 14,
            background: "#fff", border: "1px solid #E5E9F0",
            color: "#0A2B6B", cursor: "pointer",
            boxShadow: "0 1px 3px rgba(10,43,107,.04)",
            flexShrink: 0,
          }}
        >
          <SlidersHorizontal style={{ width: 16, height: 16 }} />
          {activeFilterCount > 0 && (
            <span
              className="absolute flex items-center justify-center text-white"
              style={{
                top: -4, insetInlineEnd: -4, width: 18, height: 18,
                borderRadius: "50%", background: "#C8A24B",
                fontSize: 10, fontWeight: 800, border: "2px solid #F6F9FE",
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Category chips ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", flexWrap: "wrap", padding: "0 20px 14px", gap: 8,
          flexShrink: 0, background: "#fff",
        }}
      >
        {ALL_CATEGORIES.map((cat) => {
          const active = filters.categories?.includes(cat) ?? false;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              aria-pressed={active}
              className="flex items-center font-hebrew"
              style={{
                gap: 6, padding: "8px 14px", borderRadius: 999,
                fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
                cursor: "pointer", border: "1px solid",
                transition: "background .15s, color .15s, border-color .15s, transform .1s",
                background: active ? "#0A2B6B" : "#fff",
                color: active ? "#fff" : "#4A5568",
                borderColor: active ? "#0A2B6B" : "#E5E9F0",
              }}
            >
              <span style={{ fontSize: 13 }}>{CATEGORY_EMOJI[cat]}</span>
              {PLACE_CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* ── Scrollable feed body ────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide"
        style={{ padding: "0 20px 96px" }}
      >
        {/* Section header */}
        <div style={{ margin: "6px 0 10px" }}>
          <div className="flex items-center justify-between">
          <h3
            className="font-hebrew flex items-center gap-1.5"
            style={{
              fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif",
              fontSize: 13, fontWeight: 800, color: "#0F1A2E", letterSpacing: ".02em",
            }}
          >
            {apiSearchResults !== null ? "תוצאות חיפוש" : "המלצות"}
            {searchLoading ? (
              <Loader2 style={{ width: 12, height: 12, color: "#8A95A8" }} className="animate-spin" />
            ) : visiblePlaces.length > 0 && (
              <span style={{ color: "#8A95A8", fontWeight: 500 }}>
                ({visiblePlaces.length})
              </span>
            )}
          </h3>
          {/* Sort button */}
          <button
            type="button"
            className="flex items-center gap-1 font-hebrew"
            style={{ fontSize: 12, fontWeight: 700, color: "#1F5BB5", background: "none", border: 0, cursor: "pointer", padding: "4px 0" }}
            onClick={() => {
              const opts: SortOption[] = ["top", "rating", "nearest", "newest"];
              const idx = opts.indexOf(sort);
              setSort(opts[(idx + 1) % opts.length]);
            }}
          >
            {SORT_LABELS[sort]}
            <ChevronDown style={{ width: 12, height: 12 }} />
          </button>
          </div>
          {/* Rated-only toggle chip */}
          {apiSearchResults === null && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, rated_only: !filters.rated_only })}
              className="flex items-center gap-1 font-hebrew font-semibold mt-2"
              style={{
                fontSize: 11, padding: "4px 10px", borderRadius: 999,
                border: "1px solid", cursor: "pointer",
                background: filters.rated_only ? "#0A2B6B" : "#F6F9FE",
                color: filters.rated_only ? "#fff" : "#8A95A8",
                borderColor: filters.rated_only ? "#0A2B6B" : "#E5E9F0",
                transition: "all .15s",
              }}
            >
              ★ {filters.rated_only ? "עם המלצות בלבד" : "הצג הכל"}
            </button>
          )}
        </div>

        {/* Empty state */}
        {visiblePlaces.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span style={{ fontSize: 40, marginBottom: 12 }}>🔍</span>
            <p className="font-hebrew font-semibold" style={{ color: "#4A5568" }}>לא נמצאו מקומות</p>
            <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8", marginTop: 4 }}>
              נסו לשנות את הפילטרים או להזיז את המפה
            </p>
          </div>
        ) : (
          <>
            {/* Featured card */}
            {featuredPlace && sort === "top" && (
              <PlaceCard
                place={featuredPlace}
                isSelected={selectedPlaceId === featuredPlace.id}
                onSelect={onSelectPlace}
                userLocation={userLocation}
                featured
              />
            )}

            {/* Regular cards */}
            {visiblePlaces
              .filter((p) => !(sort === "top" && p.id === featuredPlace?.id))
              .map((place) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  isSelected={selectedPlaceId === place.id}
                  onSelect={onSelectPlace}
                  userLocation={userLocation}
                />
              ))}
          </>
        )}
      </div>
    </div>
  );
}
