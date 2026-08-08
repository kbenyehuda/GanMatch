"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, MapPin, Loader2, Search, Send } from "lucide-react";
import type { Place } from "@/types/places";
import { useSession } from "@/lib/useSession";

interface GeoSuggestion {
  id: string;
  place_name: string;
  lon: number;
  lat: number;
}

export interface RequestLocationChangeModalProps {
  place: Place;
  initialLocation?: { lon: number; lat: number } | null;
  onClose: () => void;
  onSuccess: () => void;
  onPickPin: () => void;
}

export function RequestLocationChangeModal({ place, initialLocation, onClose, onSuccess, onPickPin }: RequestLocationChangeModalProps) {
  const { session } = useSession();

  const [resolvedLocation, setResolvedLocation] = useState<{ lon: number; lat: number } | null>(
    initialLocation ?? null
  );
  const [locationLabel, setLocationLabel] = useState<string>(
    initialLocation ? `${initialLocation.lat.toFixed(5)}, ${initialLocation.lon.toFixed(5)}` : ""
  );

  useEffect(() => {
    if (!initialLocation) return;
    setResolvedLocation(initialLocation);
    fetch(`/api/geocode/reverse?lon=${initialLocation.lon}&lat=${initialLocation.lat}`)
      .then((r) => r.json())
      .then((d) => { if (d.place_name) setLocationLabel(d.place_name); })
      .catch(() => setLocationLabel(`${initialLocation.lat.toFixed(5)}, ${initialLocation.lon.toFixed(5)}`));
  }, [initialLocation]);

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
    setLocationSearch("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const clearLocation = () => {
    setResolvedLocation(null);
    setLocationLabel("");
    setLocationSearch("");
  };

  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = resolvedLocation !== null && !submitting;

  const submit = useCallback(async () => {
    if (!canSubmit || !session || !resolvedLocation) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/places/location-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          place_id: place.id,
          lon: resolvedLocation.lon,
          lat: resolvedLocation.lat,
          address: locationLabel.trim() || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שגיאה בשליחת הבקשה");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, session, resolvedLocation, place.id, locationLabel, note, onSuccess]);

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
        <h2 className="font-hebrew font-bold" style={{ fontSize: 16, color: "#0A2B6B" }}>
          בקשת שינוי מיקום
        </h2>
        <button type="button" onClick={submit} disabled={!canSubmit}
          className="flex items-center gap-1.5 font-hebrew font-bold"
          style={{ padding: "8px 18px", borderRadius: 12, fontSize: 13, border: "none", cursor: canSubmit ? "pointer" : "not-allowed", background: canSubmit ? "linear-gradient(135deg, #0A2B6B, #1F5BB5)" : "#C5CDD8", color: "#fff" }}>
          {submitting ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <><Send style={{ width: 13, height: 13 }} />שלח</>}
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "20px 20px 48px" }}>
        <p className="font-hebrew text-sm mb-4" style={{ color: "#4A5568", lineHeight: 1.6 }}>
          המיקום של <strong>{place.name}</strong> לא מדויק? סמנו את המיקום הנכון על המפה או חפשו כתובת. הבקשה תישלח לאישור מנהל לפני שהמיקום יתעדכן בפועל.
        </p>

        {place.address && (
          <div className="mb-4 rounded-xl p-3" style={{ background: "#F6F9FE", border: "1px solid #E5E9F0" }}>
            <span className="font-hebrew block" style={{ color: "#8A95A8", fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700, marginBottom: 3 }}>מיקום נוכחי</span>
            <span className="font-hebrew" style={{ fontSize: 13, color: "#0F1A2E" }}>{place.address}</span>
          </div>
        )}

        <div className="mb-4">
          <label className="font-hebrew font-bold text-xs mb-1.5 block" style={{ color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase" }}>
            מיקום חדש <span style={{ color: "#C53030" }}>*</span>
          </label>

          {resolvedLocation ? (
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

              <button type="button" onClick={onPickPin}
                className="flex items-center gap-1.5 font-hebrew font-semibold mt-2"
                style={{ fontSize: 12, color: "#1F5BB5", background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                <MapPin style={{ width: 13, height: 13 }} />
                סמן על המפה במקום
              </button>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="font-hebrew font-bold text-xs mb-1.5 block" style={{ color: "#8A95A8", letterSpacing: ".06em", textTransform: "uppercase" }}>
            הערה למנהל (אופציונלי)
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="לדוגמה: הכניסה מרחוב אחר, המספר בבניין השתנה..." rows={2}
            className="w-full font-hebrew resize-none"
            style={{ ...inputStyle, lineHeight: 1.6 }} />
        </div>

        {error && <p className="font-hebrew text-sm mt-1" style={{ color: "#C53030" }}>{error}</p>}
        {!session && <p className="font-hebrew text-sm text-center mt-4" style={{ color: "#8A95A8" }}>יש להתחבר כדי לבקש שינוי מיקום</p>}
      </div>
    </div>
  );
}
