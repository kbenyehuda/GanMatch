"use client";

import { Star, Heart } from "lucide-react";
import type { Place } from "@/types/places";
import {
  PLACE_CATEGORY_COLORS,
  PLACE_CATEGORY_LABELS,
  NEIGHBORHOOD_LABELS,
} from "@/types/places";
import { factLabel, placeFacts } from "@/lib/place-facts";
import { placeTypeLabel } from "@/lib/place-type";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HMO_LABELS: Record<string, string> = {
  maccabi: "מכבי", clalit: "כללית", meuhedet: "מאוחדת", leumit: "לאומית",
};


/** Most WhatsApp recommendations (babysitters, private teachers…) have no address to pin. */
const NO_PIN_LABEL = "ללא מיקום מדויק";
const hasPin = (p: Place) => p.lat != null && p.lon != null;

function distanceLabel(place: Place, user: { lon: number; lat: number } | null): string | null {
  if (!user || place.lat == null || place.lon == null) return null;
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
  isSaved?: boolean;
  onToggleSave?: (id: string) => void;
}

// ─── Regular recommendation card ──────────────────────────────────────────────

export function PlaceCard({
  place,
  isSelected = false,
  onSelect,
  userLocation = null,
  isSaved = false,
  onToggleSave,
}: PlaceCardProps) {
  const color = PLACE_CATEGORY_COLORS[place.place_category] ?? "#8A95A8";
  const dist = distanceLabel(place, userLocation);
  const neighborhood = place.neighborhood ? NEIGHBORHOOD_LABELS[place.neighborhood] : null;

  // Meta: type (משפחתון, רופא עור · לילדים…) or category · neighborhood · distance
  // (health funds are chips below — all of them). The type is shown in the category color.
  const typeLabel = placeTypeLabel(place);
  const metaParts = [
    typeLabel ?? PLACE_CATEGORY_LABELS[place.place_category],
    neighborhood,
    dist,
    hasPin(place) ? null : NO_PIN_LABEL,
  ].filter(Boolean) as string[];

  // Tags: two chips plus "+N" for the rest. Kids lead with facts (חצר, טבעוני…); other
  // categories lead with health funds etc. "לילדים" is already in a doctor's type label.
  type Tag = { label: string; variant: "blue" | "green" | "gold" | "rose" };
  const tags: Tag[] = [];
  const factTags: Tag[] = placeFacts(place)
    .filter((f) => f.id !== "dr_for_children")
    .map((f) => ({ label: factLabel(f, place), variant: "blue" }));
  if (place.kosher === "CERTIFIED") tags.push({ label: "כשר", variant: "green" });
  if (place.price_range === 1) tags.push({ label: "זול", variant: "green" });
  if (place.price_range === 3) tags.push({ label: "יקר", variant: "rose" });
  place.hmo?.forEach((h) => {
    if (HMO_LABELS[h]) tags.push({ label: HMO_LABELS[h], variant: h === "clalit" ? "green" : h === "meuhedet" ? "gold" : "blue" });
  });
  const orderedTags = place.place_category === "kids" ? [...factTags, ...tags] : [...tags, ...factTags];
  const shownTags = orderedTags.slice(0, 2);
  const moreFacts = orderedTags.length - shownTags.length;
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
      {/* Photo, only when the place has one. The old colored square only repeated the category. */}
      {place.photos?.[0] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={place.photos[0]} alt="" className="flex-shrink-0"
          style={{ width: 68, height: 68, borderRadius: 14, objectFit: "cover" }} />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col" style={{ minHeight: place.photos?.[0] ? 68 : undefined }}>
        {/* Name */}
        <div className="flex items-center gap-1.5 mb-0.5" style={{ paddingInlineEnd: onToggleSave ? 24 : 0 }}>
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
        <div className="flex items-center flex-wrap font-hebrew mb-1.5" style={{ fontSize: 12, color: "#8A95A8", gap: 4 }}>
          {metaParts.map((item, i) => (
            <span key={i} className="flex items-center gap-1"
              style={i === 0 && typeLabel ? { color, fontWeight: 700 } : undefined}>
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
                <span className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8", fontWeight: 500 }}>· {place.rec_count}</span>
              </>
            ) : (
              <span className="font-hebrew" style={{ fontSize: 12, color: "#8A95A8" }}>אין דירוג</span>
            )}
          </div>
          {shownTags.length > 0 && (
            <div className="flex gap-1 flex-wrap justify-end">
              {shownTags.map((tag, i) => (
                <span key={i} className="font-hebrew" style={{ fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, ...TAG_STYLES[tag.variant] }}>
                  {tag.label}
                </span>
              ))}
              {moreFacts > 0 && (
                <span className="font-hebrew" style={{ fontSize: 12, fontWeight: 700, padding: "3px 7px", borderRadius: 6, background: "#F0F3F8", color: "#4A5568" }}
                  aria-label={`ועוד ${moreFacts} פרטים`}>
                  +{moreFacts}
                </span>
              )}
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
