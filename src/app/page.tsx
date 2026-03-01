"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { SearchResultsPanel } from "@/components/layout/SearchResultsPanel";
import { GanDetail } from "@/components/gan/GanDetail";
import { GanClusterList } from "@/components/gan/GanClusterList";
import { SuggestGanModal } from "@/components/gan/SuggestGanModal";
import { AuthButton } from "@/components/auth/AuthButton";
import { ConnectionGate, SKIP_LOGIN_STORAGE_KEY } from "@/components/auth/ConnectionGate";
import { fetchAllGanim } from "@/lib/ganim-api";
import type { Gan } from "@/types/ganim";
import { Baby, TriangleAlert } from "lucide-react";
import { useSession } from "@/lib/useSession";

export default function HomePage() {
  const { user, loading } = useSession();
  const [skipLogin, setSkipLogin] = useState<boolean | null>(null);
  const [ganim, setGanim] = useState<Gan[]>([]);
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
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const canViewReviews = !!user; // TODO: Wire to contribution check (Give-to-Get)

  const onBoundsChange = useCallback(() => {}, []);

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setSkipLogin(window.localStorage.getItem(SKIP_LOGIN_STORAGE_KEY) === "1");
    } catch {
      setSkipLogin(false);
    }
  }, []);

  const reloadGanim = useCallback(async () => {
    setFetchError(null);
    try {
      const data = await fetchAllGanim();
      setGanim(data);
      setSelectedGan((prev) => (prev ? data.find((g) => g.id === prev.id) ?? prev : prev));
      setSelectedClusterGanim((prev) =>
        prev
          ? prev
              .map((g) => data.find((x) => x.id === g.id) ?? g)
              .filter(Boolean)
          : prev
      );
    } catch (err) {
      console.error("[GanMatch] Failed to fetch ganim:", err);
      setFetchError(err instanceof Error ? err.message : "שגיאה בטעינת גנים");
    }
  }, []);

  useEffect(() => {
    reloadGanim();
  }, [reloadGanim]);

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

  // Filter ganim by search (client-side for now)
  const filteredGanim = searchQuery
    ? ganim.filter(
        (g) =>
          g.name_he.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (g.name_en?.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (g.city?.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (g.address?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : ganim;

  return (
    <div className="relative w-full h-screen min-h-[100dvh] overflow-hidden" dir="rtl">
      {/* Map background - full screen */}
      <div className="absolute inset-0">
        <MapContainer
          ganim={filteredGanim}
          selectedGanId={selectedGan?.id ?? null}
          onSelectGan={(g) => {
            setSelectedClusterGanim(null);
            setSelectedGan(g);
          }}
          onSelectCluster={(list) => {
            setSelectedClusterGanim(list);
            setSelectedGan(null);
          }}
          onBoundsChange={onBoundsChange}
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
          isMobileOpen={mobilePanelOpen}
          onCloseMobile={() => setMobilePanelOpen(false)}
        />
      </div>

      {/* Right-side overlay: either cluster list or gan detail */}
      {(selectedGan || selectedClusterGanim) && (
        <div className="absolute bottom-4 start-4 end-4 top-14 md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 z-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg shadow-xl">
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
              onReviewSaved={reloadGanim}
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
        <div className="absolute bottom-4 start-4 end-4 top-14 md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 z-30 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg shadow-xl">
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
              const newGan: Gan = {
                id: r.id,
                name_he: r.name_he,
                name_en: null,
                address: r.address,
                city: r.city,
                type: "Supervised",
                license_status: "Temporary",
                has_cctv: false,
                metadata: { source: "user_suggestion" },
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
              setGanim((prev) => [newGan, ...prev]);
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
        <div className="absolute top-14 start-4 end-4 md:end-[calc(24rem+1rem)] z-10 bg-amber-100 border border-amber-400 text-amber-900 px-4 py-2 rounded-lg text-sm font-hebrew">
          {fetchError}
          {fetchError.includes("Supabase") && (
            <span className="block mt-1 text-xs">
              הגדר NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY
            </span>
          )}
        </div>
      )}

      {/* Header branding */}
      <div className="absolute top-4 start-4 end-4 md:end-[calc(24rem+1rem)] z-10 flex items-center justify-between">
        <div className="flex items-center gap-2 bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg">
          <Baby className="w-6 h-6 text-gan-primary" />
          <span className="font-hebrew font-bold text-gan-dark">GanMatch</span>
          <span className="text-sm text-gray-500 font-hebrew">גן מתאים</span>
        </div>
        <div className="flex items-center gap-2">
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
        >
          {mobilePanelOpen ? "הסתר" : "חיפוש"}
        </button>
        </div>
      </div>

      {/* Mobile guest notice */}
      {!user && skipLogin && (
        <div className="absolute top-14 start-4 end-4 md:hidden z-10 bg-amber-50/95 backdrop-blur border border-amber-200 text-amber-900 px-4 py-2 rounded-lg text-xs font-hebrew flex items-center gap-2 shadow-lg">
          <TriangleAlert className="w-4 h-4" />
          מצב אורח: חלק מהפעולות מוגבלות. התחברו כדי לפתוח הכל.
        </div>
      )}
    </div>
  );
}
