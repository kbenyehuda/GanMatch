"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { SearchResultsPanel } from "@/components/layout/SearchResultsPanel";
import { GanDetail } from "@/components/gan/GanDetail";
import { GanClusterList } from "@/components/gan/GanClusterList";
import { SuggestGanModal } from "@/components/gan/SuggestGanModal";
import { AuthButton } from "@/components/auth/AuthButton";
import { ConnectionGate, SKIP_LOGIN_STORAGE_KEY } from "@/components/auth/ConnectionGate";
import { useViewportGanim } from "@/hooks/useViewportGanim";
import { pointInBounds, type Bounds } from "@/lib/ganim-api";
import { applyFilters } from "@/lib/apply-filters";
import { DEFAULT_FILTERS, type GanFilters } from "@/types/filters";
import type { SearchSuggestion } from "@/components/layout/SearchResultsPanel";
import type { Gan } from "@/types/ganim";
import { Baby, TriangleAlert } from "lucide-react";
import { useSession } from "@/lib/useSession";

export default function HomePage() {
  const { user, loading } = useSession();
  const [skipLogin, setSkipLogin] = useState<boolean | null>(null);
  const [selectedGan, setSelectedGan] = useState<Gan | null>(null);
  const [selectedClusterGanim, setSelectedClusterGanim] = useState<Gan[] | null>(
    null
  );
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestPin, setSuggestPin] = useState<{ lon: number; lat: number } | null>(
    null
  );
  const [pickingPin, setPickingPin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fitToAddress, setFitToAddress] = useState<{ lon: number; lat: number } | null>(null);
  const [filters, setFilters] = useState<GanFilters>(DEFAULT_FILTERS);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<Bounds | null>(null);
  const canViewReviews = !!user; // TODO: Wire to contribution check (Give-to-Get)

  const {
    ganim,
    loading: ganimLoading,
    error: fetchError,
    onBoundsChange,
    addGan,
    refetchViewport,
  } = useViewportGanim();

  // Keep selectedGan in sync with refetched data so edits appear immediately.
  useEffect(() => {
    if (!selectedGan || ganim.length === 0) return;
    const updated = ganim.find((g) => g.id === selectedGan.id);
    if (updated) setSelectedGan(updated);
  }, [ganim, selectedGan]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSkipLogin(window.localStorage.getItem(SKIP_LOGIN_STORAGE_KEY) === "1");
    } catch {
      setSkipLogin(false);
    }
  }, []);

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => {
      setCurrentBounds(bounds);
      onBoundsChange(bounds);
    },
    [onBoundsChange]
  );

  const handleSearchSelect = useCallback((s: SearchSuggestion) => {
    const isCity = s.place_type?.includes("place") && !s.place_type?.includes("address");
    const isAddressOrPoi =
      s.place_type?.includes("address") || s.place_type?.includes("poi");
    if (isAddressOrPoi || (!isCity && s.place_type?.length === 0)) {
      setFitToAddress({ lon: s.lon, lat: s.lat });
      setTimeout(() => setFitToAddress(null), 700);
      setSearchQuery("");
    }
  }, []);

  // Query looks like an address (street + number) - too specific to filter by; show all in view.
  const skipSearchFilter = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return true;
    if (/\d/.test(q)) return true;
    if (/\b(רחוב|שדרות|שד׳|דרך|כיכר|סמטת)\b/.test(q)) return true;
    if (q.length > 25) return true;
    return false;
  }, [searchQuery]);

  // Filter ganim: 1) by current map bounds (sync map and list), 2) by search text, 3) by attribute filters.
  // Always include selectedGan so it appears on map/list when zooming to a newly added gan.
  const filteredGanim = useMemo(() => {
    let out = ganim;
    if (currentBounds) {
      out = out.filter(
        (g) =>
          pointInBounds(g.lon, g.lat, currentBounds) ||
          (selectedGan?.id === g.id)
      );
    }
    if (searchQuery && !skipSearchFilter) {
      const q = searchQuery.toLowerCase();
      out = out.filter(
        (g) =>
          g.name_he.toLowerCase().includes(q) ||
          (g.name_en?.toLowerCase().includes(q)) ||
          (g.city?.toLowerCase().includes(q)) ||
          (g.address?.toLowerCase().includes(q))
      );
    }
    out = applyFilters(out, filters);
    return out;
  }, [ganim, currentBounds, searchQuery, skipSearchFilter, selectedGan?.id, filters]);

  if (loading || skipLogin === null) {
    return <ConnectionGate loading />;
  }

  if (!user && !skipLogin) {
    return (
      <ConnectionGate
        onSkip={() => {
          try {
            window.localStorage.setItem(SKIP_LOGIN_STORAGE_KEY, "1");
          } finally {
            setSkipLogin(true);
          }
        }}
      />
    );
  }

  return (
    <div className="relative w-full h-screen min-h-[100dvh] overflow-hidden" dir="rtl">
      {/* Map background - full screen */}
      <div className="absolute inset-0">
        <MapContainer
          ganim={filteredGanim}
          selectedGanId={selectedGan?.id ?? null}
          fitToAddress={fitToAddress}
          onSelectGan={(g) => {
            setSelectedClusterGanim(null);
            setSelectedGan(g);
          }}
          onSelectCluster={(list) => {
            setSelectedClusterGanim(list);
            setSelectedGan(null);
          }}
          onBoundsChange={handleBoundsChange}
          loading={ganimLoading}
          onMapClick={
            pickingPin
              ? (pos) => {
                  setSuggestPin(pos);
                  setPickingPin(false);
                }
              : undefined
          }
          pendingPin={suggestOpen ? suggestPin : null}
        />
      </div>

      {/* Split-pane: Search & Results panel */}
      <div className="absolute inset-y-0 start-0 z-10 flex">
        <SearchResultsPanel
          ganim={filteredGanim}
          selectedGanId={selectedGan?.id ?? null}
          onSelectGan={(g) => {
            setSelectedClusterGanim(null);
            setSelectedGan(g);
            setMobilePanelOpen(false);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSelect={handleSearchSelect}
          filters={filters}
          onFiltersChange={setFilters}
          isMobileOpen={mobilePanelOpen}
          onMobileOpenChange={setMobilePanelOpen}
          onCloseMobile={() => setMobilePanelOpen(false)}
        />
      </div>

      {/* Right-side overlay: either cluster list or gan detail */}
      {(selectedGan || selectedClusterGanim) && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 end-4 top-[calc(3.5rem+env(safe-area-inset-top))] md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 z-20 max-h-[calc(100dvh-6rem)] overflow-auto rounded-lg shadow-xl min-w-0">
          {selectedGan ? (
            <GanDetail
              gan={selectedGan}
              onBack={
                selectedClusterGanim
                  ? () => {
                      setSelectedGan(null);
                    }
                  : undefined
              }
              onClose={() => {
                setSelectedGan(null);
                setSelectedClusterGanim(null);
              }}
              canViewReviews={canViewReviews}
              onReviewSaved={refetchViewport}
            />
          ) : selectedClusterGanim ? (
            <GanClusterList
              ganim={selectedClusterGanim}
              onClose={() => setSelectedClusterGanim(null)}
              onSelectGan={(g) => {
                setSelectedGan(g);
              }}
            />
          ) : null}
        </div>
      )}

      {/* Suggest gan overlay */}
      {suggestOpen && (
        <div className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 end-4 top-[calc(3.5rem+env(safe-area-inset-top))] md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 z-30 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg shadow-xl">
          <SuggestGanModal
            pin={suggestPin}
            onPinChange={setSuggestPin}
            onRequestPin={() => {
              setSelectedGan(null);
              setSelectedClusterGanim(null);
              setPickingPin(true);
            }}
            onClose={() => {
              setSuggestOpen(false);
              setPickingPin(false);
            }}
            onSuggested={(r) => {
              const suggestedHasCctv = r.cctv_access === "online" || r.cctv_access === "exceptional";
              const suggestedStreamedOnline = r.cctv_access === "online" ? true : r.cctv_access === "exceptional" ? false : null;
              const newGan: Gan = {
                id: r.id,
                name_he: r.name_he,
                name_en: null,
                address: r.address,
                city: r.city,
                category: "UNSPECIFIED",
                maon_symbol_code: null,
                private_supervision: null,
                mishpachton_affiliation: null,
                municipal_grade: null,
                monthly_price_nis: null,
                min_age_months: null,
                max_age_months: null,
                price_notes: null,
                has_cctv: suggestedHasCctv,
                cctv_streamed_online: suggestedStreamedOnline,
                metadata: {
                  source: "user_suggestion",
                  ...(r.suggested_type ? { suggested_type: r.suggested_type } : null),
                  pikuach_ironi: r.pikuach_ironi ?? null,
                  cctv_access: r.cctv_access ?? null,
                },
                is_verified: false,
                avg_rating: null,
                avg_cleanliness: null,
                avg_staff: null,
                avg_communication: null,
                avg_food: null,
                avg_location: null,
                recommendation_count: 0,
                lat: r.lat,
                lon: r.lon,
              };
              addGan(newGan);
              setSelectedGan(newGan);
              setSelectedClusterGanim(null);
              setSuggestOpen(false);
              setPickingPin(false);
            }}
          />
        </div>
      )}

      {/* Fetch error banner */}
      {fetchError && (
        <div className="absolute top-[calc(3.5rem+env(safe-area-inset-top))] left-4 right-4 md:right-[calc(24rem+1rem)] z-10 bg-amber-100 border border-amber-400 text-amber-900 px-4 py-2 rounded-lg text-sm font-hebrew">
          {fetchError}
          {fetchError.includes("Supabase") && (
            <span className="block mt-1 text-xs">
              הגדר NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY
            </span>
          )}
        </div>
      )}

      {/* Header branding */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 right-4 md:right-[calc(24rem+1rem)] z-10 flex flex-wrap items-center justify-between gap-y-2">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg">
          <Baby className="w-6 h-6 text-gan-primary" />
          <span className="font-hebrew font-bold text-gan-dark">GanMatch</span>
          <span className="text-sm text-gray-500 font-hebrew">גן מתאים</span>
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {!user && skipLogin && (
            <div className="hidden md:flex items-center gap-2 bg-amber-50/95 backdrop-blur px-3 py-2 rounded-full shadow-lg border border-amber-200 text-amber-900 font-hebrew text-xs">
              <TriangleAlert className="w-4 h-4" />
              מצב אורח: חלק מהפעולות מוגבלות
            </div>
          )}
          <AuthButton />
          <button
            type="button"
            className="hidden md:inline-flex bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg font-hebrew text-sm border border-gan-accent/30 hover:bg-white"
            onClick={() => {
              setSuggestOpen(true);
              setSuggestPin(null);
              setPickingPin(false);
            }}
            title="הוסף גן (לא מאומת)"
          >
            הוסף גן
          </button>
          <button
            type="button"
            className="md:hidden bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg font-hebrew text-sm"
            onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
            aria-expanded={mobilePanelOpen}
            aria-controls="mobile-search-panel"
          >
            {mobilePanelOpen ? "הסתר" : "חיפוש"}
          </button>
        </div>
      </div>

      {/* Mobile guest notice */}
      {!user && skipLogin && (
        <div className="absolute top-[calc(3.5rem+env(safe-area-inset-top))] start-4 end-4 md:hidden z-10 bg-amber-50/95 backdrop-blur border border-amber-200 text-amber-900 px-4 py-2 rounded-lg text-xs font-hebrew flex items-center gap-2 shadow-lg">
          <TriangleAlert className="w-4 h-4" />
          מצב אורח: חלק מהפעולות מוגבלות. התחברו כדי לפתוח הכל.
        </div>
      )}
    </div>
  );
}
