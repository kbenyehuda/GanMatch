"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { AuthButton } from "@/components/auth/AuthButton";
import { ConnectionGate, SKIP_LOGIN_STORAGE_KEY } from "@/components/auth/ConnectionGate";
import { PlaceFeedPanel } from "@/components/places/PlaceFeedPanel";
import { PlaceDetail } from "@/components/places/PlaceDetail";
import { AddPlaceModal } from "@/components/places/AddPlaceModal";
import { usePlacesInViewport } from "@/hooks/usePlacesInViewport";
import type { Bounds } from "@/lib/places-api";
import type { Place, PlaceCategory } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
} from "@/types/places";
import { DEFAULT_PLACE_FILTERS, type PlaceFilters } from "@/types/place-filters";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Star, X, ChevronLeft,
  Map, Home, Plus, Heart, User, MapPin,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_CATEGORIES: PlaceCategory[] = [
  "doctor", "cafe", "kids", "wellness", "attraction", "food",
];

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧩",
  wellness: "🧘", attraction: "🎡", food: "🍽️",
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
  if (selectedPlaceId && !result.find((p) => p.id === selectedPlaceId)) {
    const sel = places.find((p) => p.id === selectedPlaceId);
    if (sel) result = [...result, sel];
  }
  return result;
}

// ─── Map peek sheet (slides up from bottom when pin is tapped) ────────────────

function MapPeekSheet({
  place,
  onClose,
  onOpenDetail,
  userLocation,
}: {
  place: Place;
  onClose: () => void;
  onOpenDetail: () => void;
  userLocation: { lon: number; lat: number } | null;
}) {
  const color = PLACE_CATEGORY_COLORS[place.place_category];
  const emoji = CATEGORY_EMOJI[place.place_category];

  const dist = useMemo(() => {
    if (!userLocation) return null;
    const R = 6371e3;
    const dLat = ((place.lat - userLocation.lat) * Math.PI) / 180;
    const dLon = ((place.lon - userLocation.lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((userLocation.lat * Math.PI) / 180) *
        Math.cos((place.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
  }, [place, userLocation]);

  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  return (
    <div
      className="absolute z-20 inset-x-3.5 animate-slide-up"
      style={{ bottom: "calc(86px + env(safe-area-inset-bottom))" }}
      dir="rtl"
    >
      <div
        className="bg-white rounded-[18px] p-3.5 flex items-center gap-3 relative"
        style={{ boxShadow: "0 16px 36px rgba(10,43,107,.22)" }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2.5 end-2.5 w-[22px] h-[22px] rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#E8F0FB" }}
          aria-label="סגור"
        >
          <X className="w-3 h-3 text-[#0A2B6B]" />
        </button>

        {/* Thumbnail */}
        <div
          className="w-14 h-14 rounded-[14px] flex items-center justify-center text-2xl shrink-0"
          style={{ backgroundColor: `${color}20`, border: `1.5px solid ${color}40` }}
        >
          {emoji}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 pe-8">
          <p className="font-hebrew font-bold text-[#0A2B6B] text-[15px] leading-snug line-clamp-1">
            {place.name}
          </p>
          <p className="text-[11px] text-[#8A95A8] font-hebrew mt-0.5">
            {[PLACE_CATEGORY_LABELS[place.place_category], neighborhood, dist]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {place.avg_rating != null && (
            <div className="flex items-center gap-1 mt-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-semibold text-gray-700">
                {place.avg_rating.toFixed(1)}
              </span>
              <span className="text-[11px] text-[#8A95A8]">
                ({place.rec_count} המלצות)
              </span>
            </div>
          )}
        </div>

        {/* Nav arrow */}
        <button
          type="button"
          onClick={onOpenDetail}
          className="w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#0A2B6B" }}
          aria-label="פרטים"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
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
              <span className="text-base">{CATEGORY_EMOJI[p.place_category]}</span>
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

  return (
    <div
      className="absolute z-10 inset-x-0 flex scrollbar-hide"
      style={{
        top: "calc(var(--safe-top) + 102px)",
        gap: 6, padding: "0 14px",
        overflowX: "auto",
      }}
      dir="rtl"
    >
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
              gap: 6, padding: "7px 12px",
              borderRadius: 999, fontSize: 12, fontWeight: 600,
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
            className="flex flex-col items-center"
            style={{
              flex: 1, gap: 3, padding: "6px 0",
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
                  width: 54, height: 54, borderRadius: "50%",
                  background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)",
                  color: "#fff", marginTop: -26,
                  boxShadow: "0 12px 22px rgba(10,43,107,.35)",
                  border: "4px solid #fff",
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
  const [filters, setFilters] = useState<PlaceFilters>({ ...DEFAULT_PLACE_FILTERS, rated_only: true });
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
          {/* Desktop detail: right-side overlay */}
          {(detailPlace || selectedPlace || selectedClusterPlaces) && (
            <div
              className="absolute top-4 end-4 w-[360px] z-20 overflow-hidden"
              style={{
                maxHeight: "calc(100dvh - 2rem)",
                borderRadius: 20,
                boxShadow: "0 16px 40px rgba(10,43,107,.22)",
              }}
            >
              {detailPlace ? (
                <div className="h-full" style={{ maxHeight: "calc(100dvh - 2rem)" }}>
                  <PlaceDetail
                    place={detailPlace}
                    onClose={() => { setDetailPlace(null); setSelectedPlace(null); }}
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
            className="absolute bottom-24 end-4 z-10 hidden md:flex items-center gap-2 font-hebrew font-bold"
            style={{ padding: "12px 18px", borderRadius: 999, background: "linear-gradient(135deg, #0A2B6B, #1F5BB5)", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, boxShadow: "0 8px 20px rgba(10,43,107,.35)" }}
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
            />
          </div>
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

          {/* Map header: search bar — positioned at +50px from safe area (mockup spec) */}
          {activeTab === "map" && (
            <div
              className="absolute inset-x-0 z-10"
              style={{ top: "calc(var(--safe-top) + 50px)", padding: "0 14px" }}
            >
              {/* Search bar */}
              <div
                className="flex items-center gap-2.5"
                style={{
                  background: "#fff", borderRadius: 14,
                  padding: "12px 14px",
                  boxShadow: "0 8px 20px rgba(10,43,107,.18)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A95A8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <span className="font-hebrew flex-1" style={{ fontSize: 13, color: "#8A95A8" }}>
                  חיפוש במפה...
                </span>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => (window.location.href = "/admin/triage")}
                    className="font-hebrew"
                    style={{ fontSize: 11, color: "#0A2B6B", background: "none", border: 0, cursor: "pointer", fontWeight: 600 }}
                  >
                    ניהול
                  </button>
                )}
                <AuthButton />
              </div>
            </div>
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
        <div className="md:hidden absolute inset-0 z-40 bg-white overflow-hidden">
          <PlaceDetail
            place={detailPlace}
            onClose={() => setDetailPlace(null)}
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
    </div>
  );
}
