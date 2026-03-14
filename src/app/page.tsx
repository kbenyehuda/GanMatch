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
import type { Bounds } from "@/lib/ganim-api";
import { applyFilters } from "@/lib/apply-filters";
import { DEFAULT_FILTERS, type GanFilters } from "@/types/filters";
import type { SearchSuggestion } from "@/types/search";
import type { Gan } from "@/types/ganim";
import { Baby, Loader2, TriangleAlert } from "lucide-react";
import { useSession } from "@/lib/useSession";
import { supabase } from "@/lib/supabase";

type UnlockDefaults = {
  review_full_access_days: number;
  bounty_full_access_days: number;
  bounty_required_tasks: number;
  onboarding_review_quota: number;
};

type UnlockFlags = {
  bounty_unlock: boolean;
  referral_unlock: boolean;
  onboarding_unlock: boolean;
};

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
  const [fitToAddress, setFitToAddress] = useState<{
    lon: number;
    lat: number;
    radiusM?: number;
    zoom?: number;
  } | null>(null);
  const [filters, setFilters] = useState<GanFilters>(DEFAULT_FILTERS);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<Bounds | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewReviews, setCanViewReviews] = useState(false);
  const [entitlementsRefreshKey, setEntitlementsRefreshKey] = useState(0);
  const [unlockDefaults, setUnlockDefaults] = useState<UnlockDefaults>({
    review_full_access_days: 365,
    bounty_full_access_days: 365,
    bounty_required_tasks: 3,
    onboarding_review_quota: 3,
  });
  const [unlockFlags, setUnlockFlags] = useState<UnlockFlags>({
    bounty_unlock: true,
    referral_unlock: false,
    onboarding_unlock: true,
  });

  const preserveGanIds = useMemo(
    () => (selectedGan?.id ? new Set([selectedGan.id]) : undefined),
    [selectedGan?.id]
  );

  const {
    ganim,
    loading: ganimLoading,
    pending: ganimPending,
    error: fetchError,
    onBoundsChange,
    addGan,
    refetchViewport,
  } = useViewportGanim({ preserveGanIds });

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

  useEffect(() => {
    if (!supabase || !user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) {
          if (!cancelled) setIsAdmin(false);
          return;
        }
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
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !supabase) {
      setCanViewReviews(false);
      return;
    }
    (async () => {
      try {
        const token = await supabase.auth.getSession().then((r) => r.data.session?.access_token ?? null);
        if (!token) {
          if (!cancelled) setCanViewReviews(false);
          return;
        }
        const res = await fetch("/api/entitlements/me", {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setCanViewReviews(!!user);
          return;
        }
        if (!cancelled) {
          setCanViewReviews(Boolean(data?.can_view_reviews));
          if (data?.defaults) {
            setUnlockDefaults({
              review_full_access_days: Number(data.defaults.review_full_access_days ?? 365),
              bounty_full_access_days: Number(data.defaults.bounty_full_access_days ?? 365),
              bounty_required_tasks: Number(data.defaults.bounty_required_tasks ?? 3),
              onboarding_review_quota: Number(data.defaults.onboarding_review_quota ?? 3),
            });
          }
          if (data?.feature_flags) {
            setUnlockFlags({
              bounty_unlock: Boolean(data.feature_flags.bounty_unlock),
              referral_unlock: Boolean(data.feature_flags.referral_unlock),
              onboarding_unlock: Boolean(data.feature_flags.onboarding_unlock),
            });
          }
        }
      } catch {
        if (!cancelled) setCanViewReviews(!!user);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, entitlementsRefreshKey]);

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => {
      setCurrentBounds(bounds);
      onBoundsChange(bounds);
    },
    [onBoundsChange]
  );

  const handleSelectGanForContribution = useCallback(
    (ganId: string): boolean => {
      const next = ganim.find((g) => g.id === ganId);
      if (!next) return false;
      setSelectedClusterGanim(null);
      setSelectedGan(next);
      return true;
    },
    [ganim]
  );

  const handleSearchSelect = useCallback(
    (s: SearchSuggestion) => {
      const isGan = s.place_type?.includes("gan");
      const isCity = s.place_type?.includes("place") && !s.place_type?.includes("address");
      const isAddressOrPoi =
        s.place_type?.includes("address") || s.place_type?.includes("poi");
      const shouldPan = isGan || isAddressOrPoi || isCity || (!isCity && (s.place_type?.length ?? 0) === 0);

      if (shouldPan) {
        setFitToAddress({
          lon: s.lon,
          lat: s.lat,
          radiusM: isCity ? 5000 : 1000,
          ...(isGan && { zoom: 18 }),
        });
        setTimeout(() => setFitToAddress(null), 700);
        if (isGan || isAddressOrPoi || (!isCity && (s.place_type?.length ?? 0) === 0)) {
          setFilters((prev) => ({ ...prev, location_query: null }));
        }
      }
    },
    []
  );

  // Filter ganim: location (bounds + query) AND attribute filters - all AND.
  const filteredGanim = useMemo(() => {
    return applyFilters(ganim, filters, {
      bounds: currentBounds,
      selectedGanId: selectedGan?.id,
    });
  }, [ganim, currentBounds, filters, selectedGan?.id]);

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
      {/* Loading indicator - centered, always on top */}
      {(ganimLoading || ganimPending) && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur px-5 py-3 shadow-xl border border-gray-200 font-hebrew">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-gan-primary" />
            <span className="text-sm font-semibold text-gray-800">טוען גנים...</span>
          </div>
        </div>
      )}

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
          loading={ganimLoading || ganimPending}
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
          filters={filters}
          onFiltersChange={setFilters}
          onSearchSelect={handleSearchSelect}
          allGanimInView={ganim}
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
              onSelectGanForContribution={handleSelectGanForContribution}
              canViewReviews={canViewReviews}
              unlockDefaults={unlockDefaults}
              unlockFlags={unlockFlags}
              onEntitlementChanged={() => setEntitlementsRefreshKey((k) => k + 1)}
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
        <div
          className={`absolute z-30 rounded-lg shadow-xl transition-all ${
            pickingPin
              ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 end-4 md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-72"
              : "bottom-[calc(1rem+env(safe-area-inset-bottom))] start-4 end-4 top-[calc(3.5rem+env(safe-area-inset-top))] md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 max-h-[calc(100dvh-6rem)] overflow-y-auto"
          }`}
        >
          <SuggestGanModal
            pin={suggestPin}
            onPinChange={setSuggestPin}
            pickingPin={pickingPin}
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
              setSuggestOpen(false);
              setPickingPin(false);
              setFitToAddress({ lon: r.lon, lat: r.lat, radiusM: 500 });
              setTimeout(() => setFitToAddress(null), 800);
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
              // Refetch viewport so the real gan (from ganim_v2) appears once the processor runs
              setTimeout(refetchViewport, 3000);
              setTimeout(refetchViewport, 10000);
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
          {isAdmin && (
            <button
              type="button"
              className="inline-flex bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg font-hebrew text-sm border border-gan-accent/30 hover:bg-white"
              onClick={() => {
                window.location.href = "/admin/triage";
              }}
              title="Admin triage"
            >
              ניהול בקשות
            </button>
          )}
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
