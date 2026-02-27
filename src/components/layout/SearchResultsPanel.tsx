"use client";

import { Search, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import type { Gan } from "@/types/ganim";

interface SearchResultsPanelProps {
  ganim: Gan[];
  selectedGanId: string | null;
  onSelectGan: (gan: Gan) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function SearchResultsPanel({
  ganim,
  selectedGanId,
  onSelectGan,
  searchQuery,
  onSearchChange,
  isMobileOpen = false,
  onCloseMobile,
}: SearchResultsPanelProps) {
  const content = (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-4 border-b border-gan-accent/30 shrink-0">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="חיפוש גנים לפי עיר או כתובת..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pe-10 ps-10 py-2 rounded-lg border border-gan-accent/50 focus:outline-none focus:ring-2 focus:ring-gan-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 pb-8 space-y-3">
        {ganim.length === 0 ? (
          <p className="text-center text-gray-500 py-8 font-hebrew">
            לא נמצאו גנים באזור. נסה להזיז את המפה או להרחיב את החיפוש.
          </p>
        ) : (
          ganim.map((gan) => (
            <Card
              key={gan.id}
              className={`cursor-pointer transition-colors hover:border-gan-primary ${
                selectedGanId === gan.id ? "border-gan-primary ring-2 ring-gan-primary/30" : ""
              }`}
              onClick={() => onSelectGan(gan)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-gan-dark font-hebrew">{gan.name_he}</h3>
                  {!gan.is_verified ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                      לא מאומת
                    </span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <StarRating value={gan.avg_rating} count={gan.recommendation_count} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{gan.address || gan.city || "—"}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gan-muted text-gan-dark">
                    {gan.type}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gan-accent/30 text-gan-dark">
                    {gan.license_status}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: Side panel */}
      <div className="hidden md:flex md:w-96 md:flex-shrink-0 md:h-full bg-white/95 backdrop-blur shadow-lg flex-col overflow-hidden min-h-0">
        <div className="px-4 py-3 border-b border-gan-accent/30 shrink-0">
          <h2 className="font-hebrew font-semibold text-gan-dark">חיפוש גנים</h2>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {content}
        </div>
      </div>

      {/* Mobile: Bottom sheet */}
      <div
        className={`md:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ${
          isMobileOpen ? "translate-y-0" : "translate-y-[calc(100%-56px)]"
        }`}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-12 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="h-[60vh] overflow-hidden flex flex-col min-h-0">
          <div className="px-4 py-2 border-b shrink-0">
            <h2 className="font-hebrew font-semibold text-gan-dark">חיפוש גנים</h2>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {content}
          </div>
        </div>
      </div>
    </>
  );
}
