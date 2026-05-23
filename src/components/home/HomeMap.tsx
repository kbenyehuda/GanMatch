"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { AuthButton } from "@/components/auth/AuthButton";
import { ConnectionGate, SKIP_LOGIN_STORAGE_KEY } from "@/components/auth/ConnectionGate";
import { PlaceFeedPanel, FilterSheet } from "@/components/places/PlaceFeedPanel";
import { PlaceDetail } from "@/components/places/PlaceDetail";
import { PlaceCard } from "@/components/places/PlaceCard";
import { AddPlaceModal } from "@/components/places/AddPlaceModal";
import { Toast, useToast } from "@/components/ui/Toast";
import { usePlacesInViewport } from "@/hooks/usePlacesInViewport";
import type { Bounds } from "@/lib/places-api";
import type { Place, PlaceCategory } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
  VISIBLE_CATEGORIES,
} from "@/types/places";
import { DEFAULT_PLACE_FILTERS, type PlaceFilters } from "@/types/place-filters";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Star, X, ChevronLeft,
  Map, Home, Plus, Heart, User, MapPin,
  ChevronRight,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES = VISIBLE_CATEGORIES;

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺", clinic: "🏥", cafe: "☕", kids: "🧸",
  sport: "⚽", attraction: "🎭", food: "🍴", cosmetics: "💄",
};

// ─── Client-side filter ───────────────────────────────────────────────────────

function applyPlaceFilters(
  places: Place[],
  filters: PlaceFilters,
  selectedPlaceId: string | null
): Place[] {
  let result = places;
  if (filters.categories?.length)
    result = result.filter((p) => filters.categories!.includes(p.place_category));
  if (filters.neighborhoods?.length)
    result = result.filter((p) => p.neighborhood && filters.neighborhoods!.includes(p.neighborhood));
  if (filters.kosher?.length)
    result = result.filter((p) => p.kosher && filters.kosher!.includes(p.kosher));
  if (filters.price_range?.length)
    result = result.filter((p) => p.price_range != null && filters.price_range!.includes(p.price_range));
  if (filters.hmo?.length)
    result = result.filter((p) => p.hmo?.some((h) => filters.hmo!.includes(h)));
  if (filters.rated_only)
    result = result.filter((p) => p.avg_rating != null);
  if (filters.min_rating != null)
    result = result.filter((p) => p.avg_rating != null && p.avg_rating >= filters.min_rating!);
  if (filters.search_query?.trim()) {
    const q = filters.search_query.toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }
  // Kids-specific
  if (filters.kids_gan_category?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_gan_category!.includes(String(a.gan_category ?? ""));
    });
  if (filters.kids_age_track != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      // If age data is absent, include the place (can't filter on missing data)
      if (a.min_age_months == null && a.max_age_months == null) return true;
      const minAge = Number(a.min_age_months ?? 0);
      const maxAge = Number(a.max_age_months ?? 96);
      return filters.kids_age_track === "0-3" ? maxAge <= 36 : minAge >= 36;
    });
  if (filters.kids_max_price_nis != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      const price = a.monthly_price_nis;
      if (price == null) return true;
      return Number(price) <= filters.kids_max_price_nis!;
    });
  if (filters.kids_meal_type?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_meal_type!.includes(String(a.meal_type ?? ""));
    });
  if (filters.kids_friday?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_friday!.includes(String(a.friday_schedule ?? ""));
    });
  if (filters.kids_outdoor != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.has_outdoor_space) === filters.kids_outdoor;
    });
  if (filters.kids_vacancy?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.kids_vacancy!.includes(String(a.vacancy_status ?? ""));
    });
  if (filters.kids_languages?.length)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      const langs = Array.isArray(a.languages_spoken) ? a.languages_spoken as string[] : [];
      return filters.kids_languages!.every(l => langs.includes(l));
    });
  if (filters.kids_has_mamad != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.has_mamad) === filters.kids_has_mamad;
    });
  if (filters.kids_first_aid != null)
    result = result.filter((p) => {
      if (p.place_category !== "kids") return true;
      const a = p.attributes as Record<string, unknown>;
      return Boolean(a.first_aid_trained) === filters.kids_first_aid;
    });
  // Sport-specific
  if (filters.sport_gender)
    result = result.filter((p) => {
      if (p.place_category !== "sport") return true;
      const a = p.attributes as Record<string, unknown>;
      return a.gender_restriction === filters.sport_gender;
    });
  // Attraction-specific
  if (filters.attraction_venue?.length)
    result = result.filter((p) => {
      if (p.place_category !== "attraction") return true;
      const a = p.attributes as Record<string, unknown>;
      return filters.attraction_venue!.includes(String(a.indoor_outdoor ?? ""));
    });
  if (selectedPlaceId && !result.find((p) => p.id === selectedPlaceId)) {
    const sel = places.find((p) => p.id === selectedPlaceId);
    if (sel) result = [...result, sel];
  }
  return result;
}

// ─── Helpers shared by map components ────────────────────────────────────────

function lightenHex(hex: string, t = 0.35): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const mix = (x: number) => Math.round(x + (255 - x) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

const CATEGORY_ICONS_MAP: Record<string, React.ReactNode> = {
  doctor: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>,
  cafe:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path d="M2 8h15v8a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V8z"/><path d="M17 11h2a3 3 0 0 1 0 6h-2"/></svg>,
  kids:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><circle cx="9" cy="7" r="4"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>,
  wellness: <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>,
  attraction: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  food:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}><path d="M18 8h1a4 4 0 1 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg>,
};

// ─── Map peek sheet ───────────────────────────────────────────────────────────

function MapPeekSheet({
  place, onClose, onOpenDetail, userLocation,
}: {
  place: Place; onClose: () => void; onOpenDetail: () => void;
  userLocation: { lon: number; lat: number } | null;
}) {
  const color = PLACE_CATEGORY_COLORS[place.place_category] ?? "#8A95A8";
  const lightColor = lightenHex(color);

  const dist = useMemo(() => {
    if (!userLocation) return null;
    const R = 6371e3;
    const dLat = ((place.lat - userLocation.lat) * Math.PI) / 180;
    const dLon = ((place.lon - userLocation.lon) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((userLocation.lat * Math.PI) / 180) * Math.cos((place.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
  }, [place, userLocation]);

  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;
  const hmoLabel = place.hmo?.[0] ? ({ maccabi:"מכבי",clalit:"כללית",meuhedet:"מאוחדת",leumit:"לאומית" })[place.hmo[0]] : null;

  return (
    <div
      className="absolute z-[401] inset-x-3.5"
      style={{ bottom: "calc(86px + env(safe-area-inset-bottom, 0px))", transition: "transform .3s cubic-bezier(.22,1,.36,1), opacity .25s ease" }}
      dir="rtl"
    >
      <div
        onClick={onOpenDetail}
        className="relative flex gap-3 items-flex-start cursor-pointer"
        style={{ background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 16px 36px rgba(10,43,107,.22)", display: "flex", alignItems: "flex-start" }}
      >
        {/* Close button — physical top-right (start in RTL) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute flex items-center justify-center"
          style={{ top: 8, insetInlineStart: 8, width: 22, height: 22, borderRadius: "50%", background: "#E8F0FB", border: 0, cursor: "pointer", zIndex: 1 }}
          aria-label="סגור"
        >
          <X style={{ width: 11, height: 11, color: "#4A5568" }} />
        </button>

        {/* Thumbnail — 56×56, colored gradient + icon */}
        <div
          className="relative shrink-0 overflow-hidden flex items-flex-end"
          style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: `linear-gradient(135deg, ${color} 0%, ${lightColor} 100%)`,
            display: "flex", alignItems: "flex-end", padding: 6, color: "#fff",
          }}
        >
          {/* Category pill */}
          <span className="absolute font-hebrew uppercase" style={{ top: 5, insetInlineStart: 5, background: "rgba(255,255,255,.95)", color: "#0A2B6B", fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 5, letterSpacing: ".04em" }}>
            {PLACE_CATEGORY_LABELS[place.place_category]}
          </span>
          {CATEGORY_ICONS_MAP[place.place_category]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h5 className="font-hebrew" style={{ fontSize: 15, fontWeight: 700, color: "#0F1A2E", marginBottom: 2, lineHeight: 1.25 }}>
            {place.name}
          </h5>
          <div className="font-hebrew flex flex-wrap items-center gap-1" style={{ fontSize: 11, color: "#8A95A8", margin: "3px 0" }}>
            {[PLACE_CATEGORY_LABELS[place.place_category], dist, hmoLabel].filter(Boolean).map((t, i, arr) => (
              <span key={i} className="flex items-center gap-1">{t}{i < arr.length - 1 && <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#C5CDD8", display: "inline-block" }} />}</span>
            ))}
          </div>
          {place.avg_rating != null && (
            <div className="flex items-center gap-1 mt-1">
              <svg viewBox="0 0 24 24" fill="#C8A24B" style={{ width: 12, height: 12 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#0F1A2E" }}>{place.avg_rating.toFixed(1)}</span>
              <span className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>· {place.rec_count}</span>
            </div>
          )}
        </div>

        {/* Nav arrow */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenDetail(); }}
          className="flex items-center justify-center shrink-0 self-center"
          style={{ width: 38, height: 38, borderRadius: 12, background: "#0A2B6B", color: "#fff", border: 0, cursor: "pointer" }}
          aria-label="פרטים"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16, transform: "scaleX(-1)" }}>
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Cluster list ─────────────────────────────────────────────────────────────

function PlaceClusterList({
  places,
  onSelect,
  onClose,
}: {
  places: Place[];
  onSelect: (p: Place) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute z-20 inset-x-3.5 bg-white rounded-[18px] overflow-hidden"
      style={{
        bottom: "calc(86px + env(safe-area-inset-bottom))",
        boxShadow: "0 16px 36px rgba(10,43,107,.22)",
      }}
      dir="rtl"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E9F0]">
        <span className="font-hebrew font-semibold text-[#0A2B6B] text-sm">
          {places.length} מקומות באזור
        </span>
        <button type="button" onClick={onClose}>
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <ul className="max-h-60 overflow-y-auto divide-y divide-[#E5E9F0]">
        {places.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5F6FA] text-start"
            >
              <span className="text-base">{CATEGORY_EMOJI[p.place_category] ?? "📍"}</span>
              <div className="flex-1 min-w-0">
                <p className="font-hebrew font-medium text-[#0A2B6B] text-sm truncate">
                  {p.name}
                </p>
                {p.avg_rating != null && (
                  <p className="text-[11px] text-[#8A95A8] flex items-center gap-1">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {p.avg_rating.toFixed(1)}
                  </p>
                )}
              </div>
              <ChevronLeft className="w-4 h-4 text-gray-300 shrink-0" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Map category chips (floating over map) ───────────────────────────────────

function MapFilterChips({
  filters,
  onFiltersChange,
}: {
  filters: PlaceFilters;
  onFiltersChange: (f: PlaceFilters) => void;
}) {
  const toggle = (cat: PlaceCategory) => {
    const current = filters.categories ?? [];
    const next = current.includes(cat)
      ? current.filter((c) => c !== cat)
      : [...current, cat];
    onFiltersChange({ ...filters, categories: next.length ? next : null });
  };

  const allActive = !filters.categories?.length;

  return (
    <div
      className="absolute z-[401] inset-x-0 scrollbar-hide"
      style={{
        top: "calc(var(--safe-top, 0px) + 130px)",
        display: "flex", gap: 6, padding: "4px 14px",
        overflowX: "auto", flexWrap: "nowrap",
      }}
      dir="rtl"
    >
      {/* All chip */}
      <button
        type="button"
        onClick={() => onFiltersChange({ ...filters, categories: null })}
        className="font-hebrew"
        style={{
          gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
          whiteSpace: "nowrap", flexShrink: 0, border: "none", cursor: "pointer",
          transition: "background .15s, color .15s",
          background: allActive ? "#0A2B6B" : "#fff",
          color: allActive ? "#fff" : "#4A5568",
          boxShadow: allActive ? "none" : "0 2px 8px rgba(10,43,107,.06)",
        }}
      >
        הכל
      </button>
      {ALL_CATEGORIES.map((cat) => {
        const active = filters.categories?.includes(cat) ?? false;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => toggle(cat)}
            aria-pressed={active}
            className="flex items-center font-hebrew"
            style={{
              gap: 6, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
              whiteSpace: "nowrap", flexShrink: 0, border: "none", cursor: "pointer",
              transition: "background .15s, color .15s",
              background: active ? "#0A2B6B" : "#fff",
              color: active ? "#fff" : "#4A5568",
              boxShadow: active ? "none" : "0 2px 8px rgba(10,43,107,.06)",
            }}
          >
            <span>{CATEGORY_EMOJI[cat]}</span>
            {PLACE_CATEGORY_LABELS[cat]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Bottom tab bar ───────────────────────────────────────────────────────────

type MobileTab = "home" | "map" | "add" | "saved" | "profile";

function BottomTabBar({
  active,
  onChange,
}: {
  active: MobileTab;
  onChange: (t: MobileTab) => void;
}) {
  const tabs: { id: MobileTab; label: string; Icon: React.ElementType }[] = [
    { id: "home",    label: "ראשי",    Icon: Home },
    { id: "map",     label: "מפה",     Icon: Map },
    { id: "add",     label: "",        Icon: Plus },
    { id: "saved",   label: "שמור",    Icon: Heart },
    { id: "profile", label: "פרופיל",  Icon: User },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 md:hidden flex items-center justify-around"
      dir="rtl"
      style={{
        height: "calc(72px + var(--safe-bottom))",
        background: "rgba(255,255,255,.95)",
        backdropFilter: "saturate(180%) blur(20px)",
        borderTop: "1px solid rgba(229,233,240,.7)",
        padding: "8px 16px calc(14px + var(--safe-bottom))",
      }}
    >
      {tabs.map(({ id, label, Icon }) => {
        const isActive = active === id;
        const isAdd = id === "add";
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="flex flex-col items-center justify-center"
            style={{
              flex: 1, gap: isAdd ? 0 : 3, padding: "6px 0",
              background: "none", border: 0, cursor: "pointer",
              color: isActive ? "#0A2B6B" : "#8A95A8",
              fontSize: 10, fontWeight: 600,
              transition: "color .15s",
            }}
          >
            {isAdd ? (
              <span
                className="flex items-center justify-center"
                style={{
                  width: 46, height: 46, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
                  color: "#fff",
                  boxShadow: "0 4px 14px rgba(10,43,107,.35)",
                }}
              >
                <Plus style={{ width: 22, height: 22 }} />
              </span>
            ) : (
              <>
                <Icon style={{ width: 22, height: 22 }} />
                <span className="font-hebrew">{label}</span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface HomeMapProps {
  seedPlace?: Place | null;
}

export function HomeMap({ seedPlace = null }: HomeMapProps) {
  const { user, loading } = useSession();
  const [skipLogin, setSkipLogin] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(() => seedPlace ?? null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [selectedClusterPlaces, setSelectedClusterPlaces] = useState<Place[] | null>(null);
  const [filters, setFilters] = useState<PlaceFilters>(DEFAULT_PLACE_FILTERS);
  const [fitToAddress, setFitToAddress] = useState<{
    lon: number; lat: number; radiusM?: number; zoom?: number;
  } | null>(null);
  const [currentBounds, setCurrentBounds] = useState<Bounds | null>(null);
  // Default to "home" (feed) tab — map is secondary
  const [activeTab, setActiveTab] = useState<MobileTab>("home");
  const [pickingPin, setPickingPin] = useState(false);
  const [suggestPin, setSuggestPin] = useState<{ lon: number; lat: number } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lon: number; lat: number } | null>(null);

  // ── Saved places (localStorage) ──────────────────────────────────────────────
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { const s = window.localStorage.getItem("gmt_saved"); return s ? new Set(JSON.parse(s)) : new Set(); }
    catch { return new Set(); }
  });
  const toggleSave = useCallback((id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { window.localStorage.setItem("gmt_saved", JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const { text: toastText, visible: toastVisible, showToast } = useToast();

  // ── Map overlay state ─────────────────────────────────────────────────────────
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [showMapFilterSheet, setShowMapFilterSheet] = useState(false);

  const activeFilterCountMap = (filters.categories?.length ?? 0) + (filters.hmo?.length ?? 0) + (filters.neighborhoods?.length ?? 0);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  const preservePlaceIds = useMemo(
    () => (selectedPlace?.id ? new Set([selectedPlace.id]) : undefined),
    [selectedPlace?.id]
  );

  const {
    places,
    loading: placesLoading,
    pending: placesPending,
    error: fetchError,
    onBoundsChange,
    addPlace,
  } = usePlacesInViewport({ preservePlaceIds });

  useEffect(() => {
    if (!selectedPlace || places.length === 0) return;
    const updated = places.find((p) => p.id === selectedPlace.id);
    if (updated) setSelectedPlace(updated);
  }, [places, selectedPlace]);

  useEffect(() => {
    if (!seedPlace) return;
    addPlace(seedPlace);
    setFitToAddress({ lon: seedPlace.lon, lat: seedPlace.lat, zoom: 16 });
    const t = setTimeout(() => setFitToAddress(null), 700);
    return () => clearTimeout(t);
  }, [seedPlace, addPlace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSkipLogin(window.localStorage.getItem(SKIP_LOGIN_STORAGE_KEY) === "1");
    } catch {
      setSkipLogin(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase || !user) { setIsAdmin(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) return;
        const res = await fetch("/api/admin/me", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setIsAdmin(Boolean(data?.is_admin));
      } catch {
        if (!cancelled) setIsAdmin(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Open add modal immediately — no pin-picking required first
  const startAddFlow = useCallback(() => {
    setShowAddModal(true);
  }, []);

  // Called from inside AddPlaceModal when user wants to pick a pin on the map
  const handlePickPin = useCallback(() => {
    setShowAddModal(false);
    setSuggestPin(null);
    setPickingPin(true);
    setActiveTab("map");
  }, []);

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => { setCurrentBounds(bounds); onBoundsChange(bounds); },
    [onBoundsChange]
  );

  const filteredPlaces = useMemo(
    () => applyPlaceFilters(places, filters, selectedPlace?.id ?? null),
    [places, filters, selectedPlace?.id]
  );

  // ─── Auth gate ──────────────────────────────────────────────────────────────

  if (loading || skipLogin === null) return <ConnectionGate loading />;
  if (!user && !skipLogin) {
    return (
      <ConnectionGate
        onSkip={() => {
          try { window.localStorage.setItem(SKIP_LOGIN_STORAGE_KEY, "1"); }
          finally { setSkipLogin(true); }
        }}
      />
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const showPeek = activeTab === "map" && (selectedPlace || selectedClusterPlaces);

  return (
    <div className="relative w-full h-screen min-h-[100dvh] overflow-hidden bg-[#F5F6FA]" dir="rtl">

      {/* Loading spinner */}
      {(placesLoading || placesPending) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div
            className="flex items-center gap-2 rounded-2xl bg-white px-5 py-3 font-hebrew"
            style={{ boxShadow: "0 8px 20px rgba(10,43,107,.18)" }}
          >
            <Loader2 className="h-4 w-4 animate-spin text-[#0A2B6B]" />
            <span className="text-sm font-semibold text-[#0A2B6B]">טוען מקומות...</span>
          </div>
        </div>
      )}

      {/* ── DESKTOP: side-by-side feed + map ─────────────────────────────────── */}
      <div className="hidden md:flex h-full">
        {/* Feed panel */}
        <div className="w-[360px] shrink-0 h-full border-e border-[#E5E9F0]">
          <PlaceFeedPanel
            places={filteredPlaces}
            selectedPlaceId={selectedPlace?.id ?? null}
            onSelectPlace={(p) => { setSelectedClusterPlaces(null); setSelectedPlace(p); setDetailPlace(p); }}
            filters={filters}
            onFiltersChange={setFilters}
            userLocation={userLocation}
            isVisible
            savedIds={savedIds}
            onToggleSave={(id) => { const wasSaved = savedIds.has(id); toggleSave(id); showToast(wasSaved ? "הוסר מהמועדפים" : "נשמר למועדפים ❤️"); }}
            searchQuery={mapSearchQuery}
            onSearchQueryChange={(q) => { setMapSearchQuery(q); setFilters(f => ({ ...f, search_query: q.trim() || null })); }}
          />
        </div>
        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            places={filteredPlaces}
            selectedPlaceId={selectedPlace?.id ?? null}
            initialMapFocus={seedPlace ? { lon: seedPlace.lon, lat: seedPlace.lat, zoom: 16 } : null}
            fitToAddress={fitToAddress}
            onSelectPlace={(p) => { setSelectedClusterPlaces(null); setSelectedPlace(p); }}
            onSelectCluster={(list) => { setSelectedClusterPlaces(list); setSelectedPlace(null); }}
            onBoundsChange={handleBoundsChange}
            loading={placesLoading || placesPending}
            pendingPin={suggestPin}
            onMapClick={pickingPin ? (pos) => { setSuggestPin(pos); setPickingPin(false); setShowAddModal(true); } : undefined}
          />
          {/* Desktop detail: physical right-side overlay */}
          {(detailPlace || selectedPlace || selectedClusterPlaces) && (
            <div
              className="absolute top-4 w-[360px] z-20 overflow-hidden"
              style={{
                right: 16,
                height: "calc(100dvh - 2rem)",
                borderRadius: 20,
                boxShadow: "0 16px 40px rgba(10,43,107,.22)",
              }}
            >
              {detailPlace ? (
                <div className="h-full">
                  <PlaceDetail
                    place={detailPlace}
                    onClose={() => { setDetailPlace(null); setSelectedPlace(null); }}
                    isSaved={savedIds.has(detailPlace.id)}
                    onToggleSave={() => { toggleSave(detailPlace.id); showToast(savedIds.has(detailPlace.id) ? "הוסר מהמועדפים" : "נשמר למועדפים ❤️"); }}
                    onShowToast={showToast}
                    userLocation={userLocation}
                  />
                </div>
              ) : selectedPlace ? (
                <MapPeekSheet
                  place={selectedPlace}
                  onClose={() => { setSelectedPlace(null); setSelectedClusterPlaces(null); }}
                  onOpenDetail={() => setDetailPlace(selectedPlace)}
                  userLocation={userLocation}
                />
              ) : selectedClusterPlaces ? (
                <PlaceClusterList
                  places={selectedClusterPlaces}
                  onClose={() => setSelectedClusterPlaces(null)}
                  onSelect={(p) => { setSelectedPlace(p); setSelectedClusterPlaces(null); }}
                />
              ) : null}
            </div>
          )}
          {/* Desktop add-place FAB */}
          <button
            type="button"
            onClick={startAddFlow}
            className="absolute bottom-24 z-10 hidden md:flex items-center gap-2 font-hebrew font-bold"
            style={{ right: 16, padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, boxShadow: "0 8px 20px rgba(10,43,107,.35)" }}
          >
            <Plus style={{ width: 18, height: 18 }} />
            הוסף מקום
          </button>

          {/* Auth */}
          <div className="absolute top-4 start-4 z-10 flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => (window.location.href = "/admin/triage")}
                className="bg-white px-3 py-2 rounded-2xl text-xs font-hebrew border border-[#E5E9F0] hover:bg-[#F5F6FA]"
                style={{ boxShadow: "0 2px 8px rgba(10,43,107,.06)" }}
              >
                ניהול
              </button>
            )}
            <AuthButton />
          </div>
        </div>
      </div>

      {/* ── MOBILE ───────────────────────────────────────────────────────────── */}
      <div className="md:hidden h-full">

        {/* HOME TAB: feed */}
        {activeTab === "home" && (
          <div className="absolute inset-0 z-10">
            <PlaceFeedPanel
              places={filteredPlaces}
              selectedPlaceId={selectedPlace?.id ?? null}
              onSelectPlace={(p) => {
                setSelectedClusterPlaces(null);
                setSelectedPlace(p);
                setDetailPlace(p);
              }}
              filters={filters}
              onFiltersChange={setFilters}
              userLocation={userLocation}
              isVisible
              savedIds={savedIds}
              onToggleSave={(id) => {
                const wasSaved = savedIds.has(id);
                toggleSave(id);
                showToast(wasSaved ? "הוסר מהמועדפים" : "נשמר למועדפים ❤️");
              }}
              searchQuery={mapSearchQuery}
              onSearchQueryChange={(q) => { setMapSearchQuery(q); setFilters(f => ({ ...f, search_query: q.trim() || null })); }}
              onGoProfile={() => setActiveTab("profile")}
            />
          </div>
        )}

        {/* SAVED TAB */}
        {activeTab === "saved" && (
          <SavedScreen
            places={places}
            savedIds={savedIds}
            onToggleSave={(id) => { toggleSave(id); showToast("הוסר מהמועדפים"); }}
            onSelectPlace={(p) => { setSelectedPlace(p); setDetailPlace(p); }}
            userLocation={userLocation}
            onGoProfile={() => setActiveTab("profile")}
            userInitial={user?.email?.[0]?.toUpperCase() ?? "א"}
          />
        )}

        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <ProfileScreen
            user={user}
            savedIds={savedIds}
            onGoSaved={() => setActiveTab("saved")}
            onLogout={async () => {
              await supabase?.auth.signOut();
              try { window.localStorage.removeItem(SKIP_LOGIN_STORAGE_KEY); } catch {}
              setSkipLogin(false);
              setActiveTab("home");
            }}
          />
        )}

        {/* MAP TAB: full-screen map (always mounted to keep map state) */}
        <div className={`absolute inset-0 ${activeTab === "map" ? "z-0" : "-z-10"}`}>
          <MapContainer
            places={filteredPlaces}
            selectedPlaceId={selectedPlace?.id ?? null}
            initialMapFocus={seedPlace ? { lon: seedPlace.lon, lat: seedPlace.lat, zoom: 16 } : null}
            fitToAddress={fitToAddress}
            onSelectPlace={(p) => { setSelectedClusterPlaces(null); setSelectedPlace(p); }}
            onSelectCluster={(list) => { setSelectedClusterPlaces(list); setSelectedPlace(null); }}
            onBoundsChange={handleBoundsChange}
            loading={placesLoading || placesPending}
            onMapClick={pickingPin ? (pos) => { setSuggestPin(pos); setPickingPin(false); setShowAddModal(true); setActiveTab("home"); } : undefined}
            pendingPin={suggestPin}
          />

          {/* Floating category chips over map */}
          {activeTab === "map" && (
            <MapFilterChips filters={filters} onFiltersChange={setFilters} />
          )}

          {/* Recenter button — physical right side, hide when peek showing */}
          {activeTab === "map" && userLocation && !showPeek && (
            <button
              type="button"
              onClick={() => setFitToAddress({ lon: userLocation.lon, lat: userLocation.lat, zoom: 15 })}
              className="absolute flex items-center justify-center"
              style={{
                insetInlineStart: 14,
                bottom: "calc(86px + env(safe-area-inset-bottom, 0px) + 12px)",
                width: 42, height: 42, borderRadius: 14,
                background: "#fff", border: 0, cursor: "pointer",
                boxShadow: "0 8px 24px rgba(10,43,107,.10)", zIndex: 400,
              }}
              aria-label="מרכז מפה"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#0A2B6B" strokeWidth="2" style={{ width: 18, height: 18 }}>
                <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="9"/>
                <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
              </svg>
            </button>
          )}

          {/* Map search overlay + filter button */}
          {activeTab === "map" && (
            <div
              className="absolute z-[401]"
              style={{ top: "calc(var(--safe-top, 0px) + 50px)", left: 14, right: 14 }}
              dir="rtl"
            >
              <div className="flex items-center gap-2.5" style={{ background: "#fff", borderRadius: 14, padding: "12px 14px", boxShadow: "0 8px 20px rgba(10,43,107,.18)", fontSize: 13 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A95A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  value={mapSearchQuery}
                  onChange={(e) => {
                    setMapSearchQuery(e.target.value);
                    setFilters(f => ({ ...f, search_query: e.target.value.trim() || null }));
                  }}
                  placeholder="חיפוש מקומות..."
                  className="font-hebrew flex-1"
                  style={{ border: 0, outline: 0, background: "transparent", fontSize: 13, color: "#0F1A2E", minWidth: 0 }}
                />
                {mapSearchQuery && (
                  <button type="button" onClick={() => { setMapSearchQuery(""); setFilters(f => ({ ...f, search_query: null })); }} style={{ background: "none", border: 0, cursor: "pointer", color: "#8A95A8", padding: 0, lineHeight: 0 }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                )}
                {/* Filter button */}
                <button
                  type="button"
                  onClick={() => setShowMapFilterSheet(true)}
                  className="relative flex items-center justify-center"
                  style={{ width: 36, height: 36, borderRadius: 10, background: activeFilterCountMap > 0 ? "#0A2B6B" : "#F4F8FE", border: 0, color: activeFilterCountMap > 0 ? "#fff" : "#0A2B6B", cursor: "pointer", flexShrink: 0 }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                    <path d="M3 6h18M6 12h12M10 18h4"/>
                  </svg>
                  {activeFilterCountMap > 0 && (
                    <span className="absolute flex items-center justify-center" style={{ top: -4, insetInlineEnd: -4, width: 16, height: 16, borderRadius: "50%", background: "#C8A24B", fontSize: 9, fontWeight: 800, color: "#fff", border: "2px solid #F6F9FE" }}>
                      {activeFilterCountMap}
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Map filter sheet */}
          {showMapFilterSheet && (
            <FilterSheet
              filters={filters}
              places={filteredPlaces}
              onApply={setFilters}
              onClose={() => setShowMapFilterSheet(false)}
            />
          )}

          {/* Peek sheet / cluster list */}
          {showPeek && selectedPlace && (
            <MapPeekSheet
              place={selectedPlace}
              onClose={() => { setSelectedPlace(null); setSelectedClusterPlaces(null); }}
              onOpenDetail={() => setDetailPlace(selectedPlace)}
              userLocation={userLocation}
            />
          )}
          {showPeek && selectedClusterPlaces && (
            <PlaceClusterList
              places={selectedClusterPlaces}
              onClose={() => setSelectedClusterPlaces(null)}
              onSelect={(p) => { setSelectedPlace(p); setSelectedClusterPlaces(null); }}
            />
          )}
        </div>
      </div>

      {/* Mobile full-screen PlaceDetail overlay */}
      {detailPlace && (
        <div className="md:hidden absolute inset-0 z-40 overflow-hidden" style={{ background: "#F6F9FE" }}>
          <PlaceDetail
            place={detailPlace}
            onClose={() => setDetailPlace(null)}
            isSaved={savedIds.has(detailPlace.id)}
            onToggleSave={() => {
              const wasSaved = savedIds.has(detailPlace.id);
              toggleSave(detailPlace.id);
              showToast(wasSaved ? "הוסר מהמועדפים" : "נשמר למועדפים ❤️");
            }}
            onShowToast={showToast}
            userLocation={userLocation}
          />
        </div>
      )}

      {/* Pin-picking guidance banner */}
      {pickingPin && (
        <div
          className="absolute inset-x-4 z-30 pointer-events-none"
          style={{ top: "calc(var(--safe-top, 0px) + 16px)" }}
        >
          <div
            className="flex items-center justify-center gap-2 font-hebrew font-semibold rounded-2xl py-3 px-5"
            style={{
              background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
              color: "#fff", fontSize: 14,
              boxShadow: "0 8px 20px rgba(10,43,107,.35)",
            }}
          >
            <MapPin style={{ width: 16, height: 16 }} />
            הקש על המפה כדי לסמן מיקום
          </div>
        </div>
      )}

      {/* AddPlaceModal — full-screen on mobile, centered card on desktop */}
      {showAddModal && (
        <>
          {/* Desktop backdrop */}
          <div
            className="hidden md:block fixed inset-0 z-50"
            style={{ background: "rgba(10,43,107,.45)", backdropFilter: "blur(4px)" }}
            onClick={() => { setShowAddModal(false); setSuggestPin(null); }}
          />
          {/* Mobile: full screen */}
          <div className="md:hidden absolute inset-0 z-50 bg-white overflow-hidden">
            <AddPlaceModal
              initialLocation={suggestPin}
              onClose={() => { setShowAddModal(false); setSuggestPin(null); }}
              onPickPin={handlePickPin}
              onSuccess={(place) => {
                addPlace(place);
                setSuggestPin(null);
                setShowAddModal(false);
                setSelectedPlace(place);
                setDetailPlace(place);
              }}
            />
          </div>
          {/* Desktop: centered card */}
          <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center pointer-events-none">
            <div className="pointer-events-auto overflow-hidden"
              style={{ width: "min(520px, 92vw)", maxHeight: "88dvh", borderRadius: 24, boxShadow: "0 24px 60px rgba(10,43,107,.35)", display: "flex", flexDirection: "column" }}>
              <AddPlaceModal
                initialLocation={suggestPin}
                onClose={() => { setShowAddModal(false); setSuggestPin(null); }}
                onPickPin={handlePickPin}
                onSuccess={(place) => {
                  addPlace(place);
                  setSuggestPin(null);
                  setShowAddModal(false);
                  setSelectedPlace(place);
                  setDetailPlace(place);
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* Error banner */}
      {fetchError && (
        <div className="fixed top-20 inset-x-4 z-50 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-2 rounded-2xl text-sm font-hebrew">
          {fetchError}
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <BottomTabBar
        active={activeTab}
        onChange={(tab) => {
          if (tab === "add") { startAddFlow(); return; }
          setActiveTab(tab);
        }}
      />

      {/* Toast */}
      <Toast text={toastText} visible={toastVisible} />
    </div>
  );
}

// ─── SavedScreen ──────────────────────────────────────────────────────────────

function SavedScreen({
  places, savedIds, onToggleSave, onSelectPlace, userLocation, onGoProfile, userInitial,
}: {
  places: Place[];
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onSelectPlace: (p: Place) => void;
  userLocation: { lon: number; lat: number } | null;
  onGoProfile: () => void;
  userInitial: string;
}) {
  const saved = places.filter(p => savedIds.has(p.id));

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: "#F6F9FE" }} dir="rtl">
      {/* Topbar */}
      <div style={{ background: "#fff", flexShrink: 0, padding: "6px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="GiveMyTime" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", boxShadow: "0 2px 8px rgba(10,43,107,.12)" }} />
          <div>
            <div className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", fontWeight: 500, lineHeight: 1.1 }}>מקומות שמורים</div>
            <div className="font-hebrew" style={{ fontSize: 17, fontWeight: 800, color: "#0A2B6B", marginTop: 2 }}>המועדפים שלך</div>
          </div>
        </div>
        <button type="button" onClick={onGoProfile} className="flex items-center justify-center font-hebrew font-bold"
          style={{ width: 38, height: 38, borderRadius: "50%", background: "linear-gradient(135deg,#E59A2C,#C8A24B)", color: "#fff", fontSize: 13, border: "2px solid #fff", boxShadow: "0 2px 8px rgba(10,43,107,.06)", cursor: "pointer" }}>
          {userInitial}
        </button>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: "0 20px 96px" }}>
        {saved.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#E8F0FB", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, color: "#1F5BB5" }}>
              <Heart style={{ width: 24, height: 24 }} />
            </div>
            <h4 className="font-hebrew font-bold" style={{ fontSize: 18, color: "#0F1A2E", marginBottom: 4 }}>עדיין לא שמרת מקומות</h4>
            <p className="font-hebrew" style={{ fontSize: 13, color: "#8A95A8", lineHeight: 1.5 }}>הקש על הלב על כל מקום כדי לשמור אותו לכאן</p>
          </div>
        ) : (
          <>
            <div style={{ margin: "6px 0 12px" }}>
              <h3 className="font-hebrew" style={{ fontSize: 13, fontWeight: 800, color: "#0F1A2E" }}>
                {saved.length} מקומות שמורים
              </h3>
            </div>
            {saved.map(place => (
              <PlaceCard
                key={place.id}
                place={place}
                onSelect={onSelectPlace}
                userLocation={userLocation}
                isSaved
                onToggleSave={onToggleSave}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ProfileScreen ────────────────────────────────────────────────────────────

function ProfileScreen({
  user, savedIds, onGoSaved, onLogout,
}: {
  user: { id?: string; email?: string | null } | null;
  savedIds: Set<string>;
  onGoSaved: () => void;
  onLogout: () => void;
}) {
  const displayName = user?.email?.split("@")[0] ?? "אורח";
  const initial = displayName[0]?.toUpperCase() ?? "א";
  const [recCount, setRecCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/place-reviews?user_id=${encodeURIComponent(user.id)}`)
      .then(r => r.json())
      .then(d => { if (typeof d.count === "number") setRecCount(d.count); })
      .catch(() => {});
  }, [user?.id]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden" style={{ background: "#F6F9FE" }} dir="rtl">
      {/* Hero */}
      <div className="relative shrink-0" style={{ background: "linear-gradient(160deg,#0A2B6B,#1F5BB5)", padding: "calc(var(--safe-top, 0px) + 24px) 20px 56px" }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(300px 200px at 90% 10%,rgba(200,162,75,.3),transparent 60%)" }} />
        <div className="flex items-center gap-3.5 relative">
          <img src="/app-icon.png" alt="GiveMyTime" className="shrink-0" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", boxShadow: "0 2px 8px rgba(10,43,107,.3)", opacity: 0.9 }} />
          <div className="flex items-center justify-center shrink-0" style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#E59A2C,#C8A24B)", color: "#fff", fontSize: 22, fontWeight: 800, border: "3px solid rgba(255,255,255,.3)" }}>
            {initial}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ color: "#fff", fontSize: 19, fontWeight: 800 }}>{displayName}</span>
              <span className="flex items-center gap-1" style={{ background: "rgba(200,162,75,.25)", color: "#FCE7B2", fontSize: 10, padding: "3px 7px", borderRadius: 6, fontWeight: 700 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 10, height: 10 }}><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/></svg>
                תושב/ת מאומת/ת
              </span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, color: "#fff", marginTop: 2 }} className="font-hebrew">גבעתיים · חבר/ה מאז 2024</div>
          </div>
        </div>
        {/* Floating stats card */}
        <div className="absolute flex" style={{ left: 20, right: 20, bottom: -28, background: "#fff", borderRadius: 18, padding: 14, boxShadow: "0 12px 24px rgba(10,43,107,.20)" }}>
          <div className="flex-1 text-center">
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0A2B6B", lineHeight: 1 }}>
              {recCount ?? "—"}
            </div>
            <div className="font-hebrew" style={{ fontSize: 10, color: "#8A95A8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 4 }}>המלצות</div>
          </div>
          <div style={{ width: 1, background: "#E5E9F0", margin: "6px 0" }} />
          <div className="flex-1 text-center">
            <div style={{ fontSize: 18, fontWeight: 800, color: "#0A2B6B", lineHeight: 1 }}>{savedIds.size}</div>
            <div className="font-hebrew" style={{ fontSize: 10, color: "#8A95A8", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 4 }}>שמור</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: "50px 20px 100px" }}>
        <div className="font-hebrew flex items-center justify-between" style={{ fontSize: 14, fontWeight: 800, color: "#0F1A2E", margin: "18px 0 10px" }}>
          הרשימות שלך
        </div>
        <ProfileListCard icon={<Heart style={{ width: 18, height: 18 }} />} iconBg="linear-gradient(135deg,#D86B7D,#E8A5B0)" title="מועדפים" sub={`${savedIds.size} מקומות שמורים`} onClick={onGoSaved} />

        <button
          type="button"
          onClick={onLogout}
          className="w-full font-hebrew flex items-center justify-center gap-2"
          style={{ marginTop: 24, padding: "14px 20px", borderRadius: 16, background: "none", border: "1.5px solid #E5E9F0", fontSize: 14, fontWeight: 700, color: "#E53E3E", cursor: "pointer" }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          התנתקות
        </button>
      </div>
    </div>
  );
}

function ProfileListCard({ icon, iconBg, title, sub, onClick }: { icon: React.ReactNode; iconBg: string; title: string; sub?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-start flex items-center gap-3"
      style={{ background: "#fff", border: "1px solid #E5E9F0", borderRadius: 14, padding: 12, marginBottom: 8, cursor: onClick ? "pointer" : "default", transition: "transform .12s" }}>
      <div className="flex items-center justify-center shrink-0" style={{ width: 42, height: 42, borderRadius: 12, background: iconBg, color: "#fff" }}>{icon}</div>
      <div className="flex-1">
        <h6 className="font-hebrew font-bold" style={{ fontSize: 14, color: "#0F1A2E", margin: "0 0 2px" }}>{title}</h6>
        {sub && <div className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>{sub}</div>}
      </div>
      <ChevronRight style={{ width: 18, height: 18, color: "#8A95A8" }} />
    </button>
  );
}
