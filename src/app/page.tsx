"use client";

import { useCallback, useEffect, useState } from "react";
import { MapContainer } from "@/components/map/MapContainer";
import { SearchResultsPanel } from "@/components/layout/SearchResultsPanel";
import { GanDetail } from "@/components/gan/GanDetail";
import { fetchGanimInBounds, type Bounds } from "@/lib/ganim-api";
import type { Gan } from "@/types/ganim";
import { Baby } from "lucide-react";

export default function HomePage() {
  const [ganim, setGanim] = useState<Gan[]>([]);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [selectedGan, setSelectedGan] = useState<Gan | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [canViewReviews] = useState(false); // TODO: Wire to auth + contribution check

  const onBoundsChange = useCallback((newBounds: Bounds) => {
    setBounds(newBounds);
  }, []);

  useEffect(() => {
    if (!bounds) return;
    fetchGanimInBounds(bounds).then(setGanim);
  }, [bounds]);

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
    <div className="relative w-full h-screen overflow-hidden" dir="rtl">
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
        <div className="absolute bottom-4 start-4 end-4 md:end-[calc(24rem+1rem)] md:start-auto md:top-4 md:w-96 z-20">
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
