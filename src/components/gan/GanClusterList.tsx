"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StarRating } from "@/components/ui/StarRating";
import type { Gan } from "@/types/ganim";
import {
  getGanCityForDisplay,
  getGanNeighborhoodForDisplay,
  getGanStreetAddressForDisplay,
} from "@/lib/gan-format";
import { formatGanCategoryAddonLabelHe, formatGanCategoryHe } from "@/lib/gan-display";

interface GanClusterListProps {
  ganim: Gan[];
  onClose: () => void;
  onSelectGan: (gan: Gan) => void;
}

export function GanClusterList({ ganim, onClose, onSelectGan }: GanClusterListProps) {
  const sorted = [...ganim].sort((a, b) =>
    (a.name_he || "").localeCompare(b.name_he || "", "he")
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
        <div className="min-w-0">
          <CardTitle className="font-hebrew text-lg truncate">
            {sorted.length} גנים בנקודה הזו
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5 font-hebrew">
            לחץ על פריט כדי לפתוח כרטיס מלא
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[60vh] overflow-y-auto">
          {sorted.map((g, idx) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelectGan(g)}
              className={`w-full text-start px-4 py-3 hover:bg-gan-muted/40 transition-colors ${
                idx === 0 ? "" : "border-t-4 border-gan-accent/20"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-hebrew font-semibold text-gan-dark truncate">
                  {g.name_he}
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <StarRating value={g.avg_rating} count={g.recommendation_count} showValue />
                {!g.is_verified ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                    עדיין לא אושר
                  </span>
                ) : null}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">כתובת</dt>
                <dd className="text-gray-600 font-hebrew truncate">
                  {getGanStreetAddressForDisplay(g)}
                </dd>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">עיר</dt>
                <dd className="text-gray-600 font-hebrew truncate">
                  {(() => {
                    const city = getGanCityForDisplay(g);
                    const neighborhood = getGanNeighborhoodForDisplay(g);
                    return neighborhood ? `${city} · ${neighborhood}` : city;
                  })()}
                </dd>
                <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">סוג</dt>
                <dd className="text-gray-600 font-hebrew truncate">{formatGanCategoryHe(g.category)}</dd>
                {(() => {
                  const addon = formatGanCategoryAddonLabelHe(g);
                  return addon ? (
                    <>
                      <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">{addon.label}</dt>
                      <dd className="text-gray-600 font-hebrew truncate">{addon.value}</dd>
                    </>
                  ) : null;
                })()}
              </dl>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

