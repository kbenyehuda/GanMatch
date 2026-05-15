"use client";

import { Star, BadgeCheck } from "lucide-react";
import type { Place } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
} from "@/types/places";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<string, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧩",
  wellness: "🧘", attraction: "🎡", food: "🍽️",
};

const HMO_LABELS: Record<string, string> = {
  maccabi: "מכבי", clalit: "כללית", meuhedet: "מאוחדת", leumit: "לאומית",
};

const TAG_VARIANTS = {
  blue:  { bg: "#E8F0FB", color: "#0A2B6B" },
  gold:  { bg: "#FBF1D8", color: "#9C7A21" },
  green: { bg: "#DCF3E6", color: "#1D7F4F" },
  rose:  { bg: "#FBE2E8", color: "#9C2F45" },
} as const;

type TagVariant = keyof typeof TAG_VARIANTS;

function distanceLabel(
  place: Place,
  user: { lon: number; lat: number } | null
): string | null {
  if (!user) return null;
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
}

// ─── Featured card (top pick) ─────────────────────────────────────────────────

function FeaturedCard({ place, onSelect, userLocation }: PlaceCardProps) {
  const dist = distanceLabel(place, userLocation ?? null);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      className="w-full text-start relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0A2B6B 0%, #1F5BB5 100%)",
        borderRadius: 20,
        padding: 16,
        marginBottom: 14,
        color: "#fff",
        boxShadow: "0 10px 28px rgba(10,43,107,.25)",
      }}
    >
      {/* Gold radial accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(300px 200px at 90% 100%, rgba(200,162,75,.3), transparent 60%)",
        }}
      />

      {/* Tag */}
      <div
        className="flex items-center gap-1.5 mb-2.5"
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "#E8D49F", textTransform: "uppercase" }}
      >
        <Star className="w-3 h-3 fill-[#E8D49F] text-[#E8D49F]" />
        המומלץ ביותר השבוע
      </div>

      {/* Title */}
      <h4
        className="font-hebrew mb-1 leading-[1.15]"
        style={{ fontSize: 20, fontWeight: 800 }}
      >
        {place.name}
      </h4>

      {/* Sub */}
      <p style={{ fontSize: 13, opacity: 0.78, marginBottom: 14 }} className="font-hebrew">
        {[PLACE_CATEGORY_LABELS[place.place_category], neighborhood, dist]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* Rating row */}
      <div className="flex items-center gap-3" style={{ fontSize: 12 }}>
        {place.avg_rating != null && (
          <div className="flex items-center gap-1" style={{ fontWeight: 700 }}>
            <Star className="w-3 h-3 fill-[#C8A24B] text-[#C8A24B]" />
            <span>{place.avg_rating.toFixed(1)}</span>
            <span style={{ opacity: 0.7, fontWeight: 500 }}>({place.rec_count} המלצות)</span>
          </div>
        )}
        {place.is_verified && (
          <div className="flex items-center gap-1" style={{ opacity: 0.8 }}>
            <BadgeCheck className="w-3.5 h-3.5" />
            <span style={{ fontWeight: 600 }}>מאומת</span>
          </div>
        )}
      </div>

      {/* Watermark emoji */}
      <span
        className="absolute bottom-0 end-4 select-none pointer-events-none"
        style={{ fontSize: 56, opacity: 0.15 }}
      >
        {CATEGORY_EMOJI[place.place_category]}
      </span>
    </button>
  );
}

// ─── Regular recommendation card ──────────────────────────────────────────────

export function PlaceCard({
  place,
  isSelected = false,
  onSelect,
  userLocation = null,
  featured = false,
}: PlaceCardProps) {
  if (featured) {
    return <FeaturedCard place={place} isSelected={isSelected} onSelect={onSelect} userLocation={userLocation} />;
  }

  const color = PLACE_CATEGORY_COLORS[place.place_category];
  const emoji = CATEGORY_EMOJI[place.place_category] ?? "📍";
  const dist = distanceLabel(place, userLocation);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  // Build tags
  const tags: { label: string; variant: TagVariant }[] = [];
  if (place.kosher === "CERTIFIED") tags.push({ label: "כשר", variant: "green" });
  if (place.price_range === 1) tags.push({ label: "זול", variant: "green" });
  if (place.price_range === 3) tags.push({ label: "יקר", variant: "rose" });
  place.hmo?.slice(0, 2).forEach((h) => {
    if (HMO_LABELS[h]) {
      const variant: TagVariant =
        h === "maccabi" ? "blue" : h === "clalit" ? "green" : h === "meuhedet" ? "gold" : "rose";
      tags.push({ label: HMO_LABELS[h], variant });
    }
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(place)}
      className="w-full text-start flex gap-3 transition-all duration-150 active:scale-[.98]"
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 14,
        marginBottom: 10,
        border: isSelected ? `1.5px solid ${color}` : "1px solid #E5E9F0",
        boxShadow: isSelected
          ? "0 4px 16px rgba(10,43,107,.14)"
          : "0 1px 3px rgba(10,43,107,.04)",
        alignItems: "flex-start",
      }}
    >
      {/* Thumbnail — 68×68 */}
      <div
        className="relative flex-shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: 68,
          height: 68,
          borderRadius: 14,
          background: `${color}18`,
          border: `1.5px solid ${color}30`,
          fontSize: 28,
        }}
      >
        {emoji}
        {/* Category pill overlay */}
        <span
          className="absolute font-hebrew uppercase"
          style={{
            top: 6,
            insetInlineStart: 6,
            background: "rgba(255,255,255,.95)",
            color: "#0A2B6B",
            fontSize: 9,
            fontWeight: 800,
            padding: "2px 6px",
            borderRadius: 6,
            letterSpacing: ".04em",
          }}
        >
          {PLACE_CATEGORY_LABELS[place.place_category]}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: 68 }}>
        {/* Title row */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <h5
            className="font-hebrew flex-1 line-clamp-1"
            style={{
              fontFamily: "'Plus Jakarta Sans','Heebo',sans-serif",
              fontSize: 15,
              fontWeight: 700,
              color: "#0F1A2E",
              lineHeight: 1.25,
            }}
          >
            {place.name}
          </h5>
          {place.is_verified && (
            <BadgeCheck style={{ width: 13, height: 13, color: "#1F5BB5", flexShrink: 0 }} />
          )}
        </div>

        {/* Meta row */}
        <div
          className="flex items-center flex-wrap font-hebrew mb-1.5"
          style={{ fontSize: 11, color: "#8A95A8", gap: 4 }}
        >
          {[place.address?.split(",")[0], neighborhood, dist]
            .filter(Boolean)
            .map((item, i, arr) => (
              <span key={i} className="flex items-center gap-1">
                {item}
                {i < arr.length - 1 && (
                  <span
                    className="rounded-full inline-block"
                    style={{ width: 3, height: 3, background: "#8A95A8" }}
                  />
                )}
              </span>
            ))}
        </div>

        {/* Bottom row: rating + tags */}
        <div className="flex items-center justify-between gap-2 mt-auto flex-wrap">
          {/* Rating */}
          <div className="flex items-center gap-1">
            {place.avg_rating != null ? (
              <>
                <Star style={{ width: 12, height: 12, fill: "#C8A24B", color: "#C8A24B" }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#0F1A2E" }}>
                  {place.avg_rating.toFixed(1)}
                </span>
                <span style={{ fontSize: 11, color: "#8A95A8", fontWeight: 500 }}>
                  ({place.rec_count})
                </span>
              </>
            ) : (
              <span className="font-hebrew" style={{ fontSize: 11, color: "#8A95A8" }}>
                אין דירוג
              </span>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.label}
                  className="font-hebrew"
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "3px 7px",
                    borderRadius: 6,
                    background: TAG_VARIANTS[tag.variant].bg,
                    color: TAG_VARIANTS[tag.variant].color,
                    letterSpacing: ".01em",
                  }}
                >
                  {tag.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
