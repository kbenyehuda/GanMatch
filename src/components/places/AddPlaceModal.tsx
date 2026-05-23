"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, MapPin, Phone, Globe, Clock, Star, Send, Loader2, Search, ChevronDown } from "lucide-react";
import type { Place, PlaceCategory } from "@/types/places";
import { PLACE_CATEGORY_LABELS, PLACE_CATEGORY_COLORS, VISIBLE_CATEGORIES } from "@/types/places";
import { useSession } from "@/lib/useSession";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺", cafe: "☕", kids: "🧸",
  sport: "⚽", attraction: "🎭", food: "🍴",
  cosmetics: "💄",
};

const ALL_CATEGORIES = VISIBLE_CATEGORIES;

interface GeoSuggestion {
  id: string;
  place_name: string;
  lon: number;
  lat: number;
}

function StarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform active:scale-90"
        >
          <Star style={{ width: 26, height: 26, fill: (hover || value) >= n ? "#C8A24B" : "none", color: (hover || value) >= n ? "#C8A24B" : "#CBD5E0" }} />
        </button>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface AddPlaceModalProps {
  initialLocation?: { lon: number; lat: number } | null;
  onClose: () => void;
  onSuccess: (place: Place) => void;
  onPickPin: () => void;
}

export function AddPlaceModal({ initialLocation, onClose, onSuccess, onPickPin }: AddPlaceModalProps) {
  const { user, session } = useSession();

  // Location state — can come from initialLocation (pin) or from geocode search
  const [resolvedLocation, setResolvedLocation] = useState<{ lon: number; lat: number } | null>(
    initialLocation ?? null
  );
  const [locationLabel, setLocationLabel] = useState<string>(
    initialLocation ? `${initialLocation.lat.toFixed(5)}, ${initialLocation.lon.toFixed(5)}` : ""
  );

  // Sync when parent passes a new pin location (after map pick)
  useEffect(() => {
    if (!initialLocation) return;
    setResolvedLocation(initialLocation);
    // Reverse geocode to get a human-readable label
    fetch(`/api/geocode/reverse?lon=${initialLocation.lon}&lat=${initialLocation.lat}`)
      .then((r) => r.json())
      .then((d) => { if (d.place_name) setLocationLabel(d.place_name); })
      .catch(() => setLocationLabel(`${initialLocation.lat.toFixed(5)}, ${initialLocation.lon.toFixed(5)}`));
  }, [initialLocation]);

  // Address autocomplete
  const [locationSearch, setLocationSearch] = useState("");
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (locationSearch.trim().length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    setSuggestLoading(true);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(locationSearch)}&city=גבעתיים`);
        const d = await res.json();
        setSuggestions(d.suggestions ?? []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 350);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, [locationSearch]);

  const selectSuggestion = (s: GeoSuggestion) => {
    setResolvedLocation({ lon: s.lon, lat: s.lat });
    setLocationLabel(s.place_name);
    setAddress(s.place_name.split(",")[0] ?? s.place_name);
    setLocationSearch("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const clearLocation = () => {
    setResolvedLocation(null);
    setLocationLabel("");
    setLocationSearch("");
  };

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [hours, setHours] = useState("");
  const [showMoreFields, setShowMoreFields] = useState(false);

  // Review
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewAnonymous, setReviewAnonymous] = useState(true);
  const [reviewerName, setReviewerName] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && category !== null && resolvedLocation !== null && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || !user || !session) return;
    if (!resolvedLocation) { setError("נא לבחור מיקום"); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          name: name.trim(),
          place_category: category,
          lon: resolvedLocation.lon,
          lat: resolvedLocation.lat,
          address: address.trim() || locationLabel || null,
          description: description.trim() || null,
          phone: phone.trim() || null,
          website: website.trim() || null,
          hours: hours.trim() || null,
          review_rating: showReview && reviewRating > 0 ? reviewRating : null,
          review_text: showReview ? reviewText.trim() || null : null,
          review_is_anonymous: reviewAnonymous,
          reviewer_public_name: !reviewAnonymous ? reviewerName.trim() || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירה");
      onSuccess(data.place as Place);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, user, session, resolvedLocation, name, category, address, locationLabel, description, phone, website, hours, showReview, reviewRating, reviewText, reviewAnonymous, reviewerName, onSuccess]);

  const inputStyle = {
    background: "#fff", border: "1px solid #E5E9F0", borderRadius: 12,
    padding: "11px 14px", fontSize: 14, color: "#0F1A2E", outline: "none",
    width: "100%", boxSizing: "border-box" as const,
  };

  return (
    <div className="flex flex-col h-full bg-white" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #E5E9F0" }}>
        <button type="button" onClick={onClose} className="flex items-center justify-center"
          style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer" }}>
          <X style={{ width: 16, height: 16, color: "#4A5568" }} />
        </button>
        <h2 className="font-hebrew font-bold" style={{ fontSize: 16, color: "#0A2B6B", }}>
          הוסף מקום
        </h2>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="flex items-center gap-1.5 font-hebrew font-bold"
          style={{ padding: "8px 18px", borderRadius: 12, fontSize: 13, border: "none", cursor: canSubmit ? "pointer" : "not-allowed", background: canSubmit ? "linear-gradient(135deg, #0A2B6B, #1F5BB5)" : "#C5CDD8", color: "#fff" }}>
          {submitting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <><Send style={{ width: 13, height: 13 }} />שלח</>}
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 48px" }}>

        {/* ── Location ─────────────────────────────────────────────────────── */}
        <div className="mb-4">
          <label className="font-hebrew font-bold text-xs mb-1.5 block" style={{ color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase" }}>
            מיקום <span style={{ color: "#C53030" }}>*</span>
          </label>

          {resolvedLocation ? (
            // Location is set
            <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "#F0F7FF", border: "1px solid #C3DCF8" }}>
              <MapPin style={{ width: 15, height: 15, color: "#1F5BB5", flexShrink: 0, marginTop: 2 }} />
              <p className="font-hebrew text-sm flex-1 leading-snug" style={{ color: "#0A2B6B" }}>
                {locationLabel || `${resolvedLocation.lat.toFixed(5)}, ${resolvedLocation.lon.toFixed(5)}`}
              </p>
              <button type="button" onClick={clearLocation}
                className="font-hebrew font-semibold shrink-0 text-xs" style={{ color: "#8A95A8", background: "none", border: "none", cursor: "pointer" }}>
                שנה
              </button>
            </div>
          ) : (
            // No location — show search + pin option
            <div className="relative">
              <div className="relative">
                <Search style={{ width: 15, height: 15, color: "#8A95A8", position: "absolute", top: "50%", transform: "translateY(-50%)", insetInlineStart: 13, pointerEvents: "none" }} />
                <input
                  type="text"
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                  placeholder="חפש כתובת בגבעתיים..."
                  className="w-full font-hebrew"
                  style={{ ...inputStyle, paddingInlineStart: 40 }}
                />
                {suggestLoading && (
                  <Loader2 style={{ width: 14, height: 14, color: "#8A95A8", position: "absolute", top: "50%", transform: "translateY(-50%)", insetInlineEnd: 12 }} className="animate-spin" />
                )}
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute w-full z-10 rounded-xl overflow-hidden" style={{ top: "calc(100% + 4px)", border: "1px solid #E5E9F0", background: "#fff", boxShadow: "0 8px 24px rgba(10,43,107,.12)" }}>
                  {suggestions.map((s) => (
                    <button key={s.id} type="button" onMouseDown={() => selectSuggestion(s)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 text-start hover:bg-[#F6F9FE] font-hebrew">
                      <MapPin style={{ width: 13, height: 13, color: "#8A95A8", flexShrink: 0, marginTop: 3 }} />
                      <span className="text-sm text-[#374151] leading-snug">{s.place_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Pin on map fallback */}
              <button type="button" onClick={onPickPin}
                className="flex items-center gap-1.5 font-hebrew font-semibold mt-2"
                style={{ fontSize: 12, color: "#1F5BB5", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                <MapPin style={{ width: 13, height: 13 }} />
                סמן על המפה במקום
              </button>
            </div>
          )}
        </div>

        {/* ── Name ─────────────────────────────────────────────────────────── */}
        <div className="mb-4">
          <label className="font-hebrew font-bold text-xs mb-1.5 block" style={{ color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase" }}>
            שם המקום <span style={{ color: "#C53030" }}>*</span>
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: ד״ר כהן, בית קפה הפינה..."
            className="w-full font-hebrew" style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
            onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />
        </div>

        {/* ── Category ─────────────────────────────────────────────────────── */}
        <div className="mb-4">
          <label className="font-hebrew font-bold text-xs mb-2 block" style={{ color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase" }}>
            קטגוריה <span style={{ color: "#C53030" }}>*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.map((cat) => {
              const active = category === cat;
              const color = PLACE_CATEGORY_COLORS[cat];
              return (
                <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className="flex items-center gap-1.5 font-hebrew font-semibold"
                  style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, border: "1.5px solid", cursor: "pointer", whiteSpace: "nowrap", background: active ? color : "#fff", color: active ? "#fff" : "#4A5568", borderColor: active ? color : "#E5E9F0", boxShadow: active ? `0 2px 8px ${color}40` : "none", transition: "all .15s" }}>
                  <span>{CATEGORY_EMOJI[cat]}</span>{PLACE_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── More details toggle ───────────────────────────────────────────── */}
        <button type="button" onClick={() => setShowMoreFields(!showMoreFields)}
          className="flex items-center gap-1.5 font-hebrew font-semibold mb-3 w-full"
          style={{ fontSize: 13, color: "#1F5BB5", background: "none", border: "none", cursor: "pointer", padding: "6px 0", borderTop: "1px solid #F0F3FA" }}>
          <ChevronDown style={{ width: 15, height: 15, transform: showMoreFields ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
          {showMoreFields ? "הסתר פרטים נוספים" : "הוסף פרטים (כתובת, טלפון, שעות...)"}
        </button>

        {showMoreFields && (
          <div className="space-y-3 mb-4">
            {/* Address */}
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="כתובת מלאה (לתצוגה על הכרטיס)"
              className="w-full font-hebrew" style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
              onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />

            <div className="grid grid-cols-2 gap-2">
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="📞 טלפון" className="font-hebrew" style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />
              <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)}
                placeholder="🌐 אתר" className="font-hebrew" dir="ltr" style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
                onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />
            </div>

            <input type="text" value={hours} onChange={(e) => setHours(e.target.value)}
              placeholder="🕐 שעות פעילות (לדוגמה: א׳-ה׳ 09:00-18:00)"
              className="w-full font-hebrew" style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
              onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />

            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר..." rows={2}
              className="w-full font-hebrew resize-none"
              style={{ ...inputStyle, lineHeight: 1.6 }}
              onFocus={(e) => { e.target.style.borderColor = "#1F5BB5"; }}
              onBlur={(e) => { e.target.style.borderColor = "#E5E9F0"; }} />
          </div>
        )}

        {/* ── Review ───────────────────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E5E9F0" }}>
          <button type="button" onClick={() => setShowReview(!showReview)}
            className="w-full flex items-center justify-between font-hebrew font-bold px-4 py-3"
            style={{ background: "#F6F9FE", border: "none", cursor: "pointer", fontSize: 13, color: "#0A2B6B" }}>
            <span className="flex items-center gap-2">
              <Star style={{ width: 14, height: 14, fill: showReview ? "#C8A24B" : "none", color: showReview ? "#C8A24B" : "#0A2B6B" }} />
              הוסף המלצה ראשונה (אופציונלי)
            </span>
            <span style={{ fontSize: 11, color: "#8A95A8", fontWeight: 500 }}>{showReview ? "▲" : "▼"}</span>
          </button>

          {showReview && (
            <div className="px-4 py-3 space-y-3">
              <StarInput value={reviewRating} onChange={setReviewRating} />
              <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)}
                placeholder="שתף/י את הניסיון שלך..." rows={2}
                className="w-full font-hebrew resize-none"
                style={{ ...inputStyle, lineHeight: 1.6 }} />
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={reviewAnonymous} onChange={(e) => setReviewAnonymous(e.target.checked)} style={{ accentColor: "#0A2B6B" }} />
                <span className="font-hebrew text-xs" style={{ color: "#4A5568" }}>שלח/י באנונימיות</span>
              </label>
              {!reviewAnonymous && (
                <input type="text" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="שם לתצוגה" className="w-full font-hebrew" style={inputStyle} />
              )}
            </div>
          )}
        </div>

        {error && <p className="font-hebrew text-sm mt-3" style={{ color: "#C53030" }}>{error}</p>}
        {!user && <p className="font-hebrew text-sm text-center mt-4" style={{ color: "#8A95A8" }}>יש להתחבר כדי להוסיף מקום</p>}
      </div>
    </div>
  );
}
