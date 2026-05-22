"use client";

import { Star, Heart } from "lucide-react";
import type { Place } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
} from "@/types/places";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HMO_LABELS: Record<string, string> = {
  maccabi: "מכבי", clalit: "כללית", meuhedet: "מאוחדת", leumit: "לאומית",
};


// Lighten a hex color by mixing toward white (match HTML lighten function)
function lightenColor(hex: string, t = 0.35): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (x: number) => Math.round(x + (255 - x) * t);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function distanceLabel(place: Place, user: { lon: number; lat: number } | null): string | null {
  if (!user) return null;
  if (!isFinite(place.lat) || !isFinite(place.lon)) return null;
  const R = 6371e3;
  const dLat = ((place.lat - user.lat) * Math.PI) / 180;
  const dLon = ((place.lon - user.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((user.lat * Math.PI) / 180) *
      Math.cos((place.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const m = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaceCardProps {
  place: Place;
  isSelected?: boolean;
  onSelect: (place: Place) => void;
  userLocation?: { lon: number; lat: number } | null;
  featured?: boolean;
  isSaved?: boolean;
  onToggleSave?: (id: string) => void;
}

// ─── Featured card ────────────────────────────────────────────────────────────

function FeaturedCard({ place, onSelect, userLocation, isSaved, onToggleSave }: PlaceCardProps) {
  const dist = distanceLabel(place, userLocation ?? null);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  return (
    <div className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(place)}
        onKeyDown={(e) => e.key === "Enter" && onSelect(place)}
        className="w-full text-start relative overflow-hidden cursor-pointer"
        style={{
          background: "linear-gradient(135deg, #0A2B6B 0%, #1F5BB5 100%)",
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
          color: "#fff",
          boxShadow: "0 10px 28px rgba(10,43,107,.25)",
          display: "block",
        }}
      >
        {/* Gold radial */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(300px 200px at 90% 100%, rgba(200,162,75,.3), transparent 60%)",
        }} />
        {/* Eyebrow */}
        <div className="flex items-center gap-1.5 mb-2.5" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: ".12em",
          color: "#E8D49F", textTransform: "uppercase",
        }}>
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 11, height: 11 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
          </svg>
          המומלץ ביותר · השבוע
        </div>
        {/* Name */}
        <h4 className="font-hebrew mb-1" style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.15 }}>
          {place.name}
        </h4>
        {/* Sub */}
        <div className="font-hebrew mb-3.5" style={{ fontSize: 13, opacity: 0.78 }}>
          {[PLACE_CATEGORY_LABELS[place.place_category], neighborhood, dist].filter(Boolean).join(" · ")}
        </div>
        {/* Rating row */}
        <div className="flex items-center gap-3" style={{ fontSize: 12 }}>
          {place.avg_rating != null && (
            <div className="flex items-center gap-1" style={{ fontWeight: 700 }}>
              <svg viewBox="0 0 24 24" fill="#C8A24B" style={{ width: 13, height: 13 }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
              </svg>
              {place.avg_rating.toFixed(1)}
              <span style={{ opacity: 0.7, fontWeight: 500 }}>· {place.rec_count} המלצות</span>
            </div>
          )}
        </div>
      </div>
      {/* Heart — sibling, not nested */}
      {onToggleSave && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleSave(place.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleSave(place.id); } }}
          className="absolute cursor-pointer"
          style={{ top: 14, insetInlineEnd: 14, background: "rgba(255,255,255,.15)", borderRadius: 10, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}
          aria-label={isSaved ? "הסר מהמועדפים" : "שמור למועדפים"}
        >
          <Heart style={{ width: 16, height: 16, color: isSaved ? "#D86B7D" : "rgba(255,255,255,.7)", fill: isSaved ? "#D86B7D" : "none" }} />
        </div>
      )}
    </div>
  );
}

// ─── Regular recommendation card ──────────────────────────────────────────────

export function PlaceCard({
  place,
  isSelected = false,
  onSelect,
  userLocation = null,
  featured = false,
  isSaved = false,
  onToggleSave,
}: PlaceCardProps) {
  if (featured) {
    return <FeaturedCard place={place} isSelected={isSelected} onSelect={onSelect} userLocation={userLocation} isSaved={isSaved} onToggleSave={onToggleSave} />;
  }

  const color = PLACE_CATEGORY_COLORS[place.place_category] ?? "#8A95A8";
  const lightColor = lightenColor(color);
  const dist = distanceLabel(place, userLocation);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  // Meta: category · first HMO · neighborhood · distance
  const metaParts = [
    PLACE_CATEGORY_LABELS[place.place_category],
    place.hmo?.[0] ? HMO_LABELS[place.hmo[0]] : null,
    neighborhood,
    dist,
  ].filter(Boolean) as string[];

  // Tags
  const tags: { label: string; variant: "blue" | "green" | "gold" | "rose" }[] = [];
  if (place.kosher === "CERTIFIED") tags.push({ label: "כשר", variant: "green" });
  if (place.price_range === 1) tags.push({ label: "זול", variant: "green" });
  if (place.price_range === 3) tags.push({ label: "יקר", variant: "rose" });
  place.hmo?.slice(0, 1).forEach((h) => {
    if (HMO_LABELS[h]) tags.push({ label: HMO_LABELS[h], variant: h === "clalit" ? "green" : h === "meuhedet" ? "gold" : "blue" });
  });
  const TAG_STYLES = {
    blue:  { background: "#E8F0FB", color: "#0A2B6B" },
    green: { background: "#DCF3E6", color: "#1D7F4F" },
    gold:  { background: "#FBF1D8", color: "#9C7A21" },
    rose:  { background: "#FBE2E8", color: "#9C2F45" },
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(place)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(place)}
      className="w-full text-start transition-transform duration-100 active:scale-[.98] cursor-pointer"
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 14,
        marginBottom: 10,
        border: isSelected ? `1.5px solid ${color}` : "1px solid #E5E9F0",
        boxShadow: isSelected ? "0 4px 16px rgba(10,43,107,.14)" : "0 1px 3px rgba(10,43,107,.04)",
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        position: "relative",
      }}
    >
      {/* Thumbnail */}
      <div
        className="relative flex-shrink-0 overflow-hidden"
        style={{
          width: 68, height: 68, borderRadius: 14,
          background: `linear-gradient(135deg, ${color} 0%, ${lightColor} 100%)`,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Category pill */}
        <span
          className="absolute font-hebrew uppercase"
          style={{
            top: 6, insetInlineStart: 6,
            background: "rgba(255,255,255,.95)", color: "#0A2B6B",
            fontSize: 9, fontWeight: 800, padding: "2px 6px",
            borderRadius: 6, letterSpacing: ".04em",
          }}
        >
          {PLACE_CATEGORY_LABELS[place.place_category]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: 68 }}>
        {/* Name */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <h5
            className="font-hebrew flex-1 line-clamp-1"
            style={{
              fontSize: 15, fontWeight: 700, color: "#0F1A2E", lineHeight: 1.25,
            }}
          >
            {place.name}
          </h5>
        </div>

        {/* Meta */}
        <div className="flex items-center flex-wrap font-hebrew mb-1.5" style={{ fontSize: 11, color: "#8A95A8", gap: 4 }}>
          {metaParts.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {item}
              {i < metaParts.length - 1 && (
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#8A95A8", display: "inline-block" }} />
              )}
            </span>
          ))}
        </div>

        {/* Bottom: rating + tags */}
        <div className="flex items-center justify-between gap-2 mt-auto flex-wrap">
          <div className="flex items-center gap-1">
            {place.avg_rating != null ? (
              <>
                <svg viewBox="0 0 24 24" fill="#C8A24B" style={{ width: 12, height: 12 }}>
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0F1A2E" }}>{place.avg_rating.toFixed(1)}</span>
                <span className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8", fontWeight: 500 }}>· {place.rec_count}</span>
              </>
            ) : (
              <span className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>אין דירוג</span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {tags.slice(0, 2).map((tag, i) => (
                <span key={i} className="font-hebrew" style={{ fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 6, letterSpacing: ".01em", ...TAG_STYLES[tag.variant] }}>
                  {tag.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Heart — div to avoid nested interactive elements */}
      {onToggleSave && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onToggleSave(place.id); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleSave(place.id); } }}
          className="absolute cursor-pointer"
          style={{ top: 12, insetInlineEnd: 12, background: "none", padding: 2, lineHeight: 0 }}
          aria-label={isSaved ? "הסר מהמועדפים" : "שמור למועדפים"}
        >
          <Heart style={{ width: 18, height: 18, color: isSaved ? "#D86B7D" : "#C5CDD8", fill: isSaved ? "#D86B7D" : "none" }} />
        </div>
      )}
    </div>
  );
}
