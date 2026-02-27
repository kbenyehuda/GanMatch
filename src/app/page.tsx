"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { SearchResultsPanel } from "@/components/layout/SearchResultsPanel";
import { GanDetail } from "@/components/gan/GanDetail";
import { fetchAllGanim } from "@/lib/ganim-api";
import type { Gan } from "@/types/ganim";
import { Baby } from "lucide-react";

export default function HomePage() {
  const [ganim, setGanim] = useState<Gan[]>([]);
  const [selectedGan, setSelectedGan] = useState<Gan | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [canViewReviews] = useState(false); // TODO: Wire to auth + contribution check

  const onBoundsChange = useCallback(() => {}, []);

  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    setFetchError(null);
    fetchAllGanim()
      .then((data) => {
        setGanim(data);
        setFetchError(null);
      })
      .catch((err) => {
        console.error("[GanMatch] Failed to fetch ganim:", err);
        setGanim([]);
        setFetchError(err instanceof Error ? err.message : "שגיאה בטעינת גנים");
      });
  }, []);

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
          onSelectGan={setSelectedGan}
          onBoundsChange={onBoundsChange}
        />
      </div>

      {/* Split-pane: Search & Results panel */}
      <div className="absolute inset-y-0 start-0 z-10 flex">
        <SearchResultsPanel
          ganim={filteredGanim}
          selectedGanId={selectedGan?.id ?? null}
          onSelectGan={(g) => {
            setSelectedGan(g);
            setMobilePanelOpen(false);
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isMobileOpen={mobilePanelOpen}
          onCloseMobile={() => setMobilePanelOpen(false)}
        />
      </div>

      {/* Gan detail overlay - appears when a pin is selected */}
      {selectedGan && (
        <div className="absolute bottom-4 start-4 end-4 top-14 md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:bottom-auto md:w-96 z-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg shadow-xl">
          <GanDetail
            gan={selectedGan}
            onClose={() => setSelectedGan(null)}
            canViewReviews={canViewReviews}
            onRequestLogin={() => {
              // TODO: Open auth modal
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
        <button
          type="button"
          className="md:hidden bg-white/95 backdrop-blur px-4 py-2 rounded-full shadow-lg font-hebrew text-sm"
          onClick={() => setMobilePanelOpen(!mobilePanelOpen)}
        >
          {mobilePanelOpen ? "הסתר" : "חיפוש"}
        </button>
      </div>
    </div>
  );
}
