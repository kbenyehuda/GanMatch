"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Gan } from "@/types/ganim";

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
                <div className="text-[11px] text-gray-500 whitespace-nowrap">
                  {g.type}
                </div>
              </div>
              <div className="mt-1 text-sm text-gray-600 font-hebrew truncate">
                {g.address || g.city || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-gan-muted text-gan-dark">
                  {g.license_status}
                </span>
                {g.has_cctv ? (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gan-accent/30 text-gan-dark">
                    CCTV
                  </span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

