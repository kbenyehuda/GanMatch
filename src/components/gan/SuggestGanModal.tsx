"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, X, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { formatSpokenLanguageHe } from "@/lib/gan-display";
import type { Gan } from "@/types/ganim";

export interface SuggestGanResult {
  id: string;
  name_he: string;
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
  suggested_type?: string;
  pikuach_ironi?: boolean | null;
  cctv_access?: "none" | "exceptional" | "online" | null;
  /** True when suggestion is queued for moderation (not yet visible on map) */
  pending?: boolean;
}

type GeocodeSuggestion = {
  id: string;
  place_name: string;
  lon: number;
  lat: number;
};

/** Extract city from Mapbox place_name (e.g. "דוד בלוך 43, תל אביב-יפו, ישראל" -> "תל אביב-יפו") */
function extractCityFromPlaceName(placeName: string): string | null {
  const parts = placeName.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1] ?? "";
  if (last === "ישראל" || last === "Israel") {
    return parts[parts.length - 2] ?? null;
  }
  return parts[parts.length - 1] ?? null;
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gan-accent/30 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-gan-muted/30 font-hebrew font-medium text-gan-dark text-sm"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open ? <div className="p-3 space-y-3 border-t border-gan-accent/20">{children}</div> : null}
    </div>
  );
}

export function SuggestGanModal({
  onClose,
  pin,
  onPinChange,
  onRequestPin,
  onSuggested,
  pickingPin = false,
}: {
  onClose: () => void;
  pin: { lon: number; lat: number } | null;
  onPinChange: (pin: { lon: number; lat: number } | null) => void;
  onRequestPin: () => void;
  onSuggested: (r: SuggestGanResult) => void;
  pickingPin?: boolean;
}) {
  const { user } = useSession();
  const [nameHe, setNameHe] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [phones, setPhones] = useState<Array<{ number: string; whatsapp: boolean }>>([{ number: "", whatsapp: true }]);
  const [ganTypeChoice, setGanTypeChoice] = useState<string>("UNSPECIFIED");
  const [category, setCategory] = useState<Gan["category"]>("UNSPECIFIED");
  const [maonSymbolCode, setMaonSymbolCode] = useState("");
  const [privateSupervision, setPrivateSupervision] = useState<"UNKNOWN" | "SUPERVISED" | "NOT_SUPERVISED">("UNKNOWN");
  const [mishpachtonAffiliation, setMishpachtonAffiliation] = useState<"UNKNOWN" | "PRIVATE" | "TAMAT">("UNKNOWN");
  const [municipalGrade, setMunicipalGrade] = useState<"UNKNOWN" | "TTAH" | "TAH" | "HOVA">("UNKNOWN");
  const [suggestedType, setSuggestedType] = useState("");
  const [pikuachIroni, setPikuachIroni] = useState<boolean | null>(null);
  const [cctvAccess, setCctvAccess] = useState<"none" | "exceptional" | "online" | null>(null);
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [priceFree, setPriceFree] = useState(false);
  const [priceNotes, setPriceNotes] = useState("");
  const [minAgeYears, setMinAgeYears] = useState("");
  const [maxAgeYears, setMaxAgeYears] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [fridaySchedule, setFridaySchedule] = useState<NonNullable<Gan["friday_schedule"]>>("UNKNOWN");
  const [mealType, setMealType] = useState<NonNullable<Gan["meal_type"]>>("UNKNOWN");
  const [veganFriendly, setVeganFriendly] = useState<boolean | null>(null);
  const [vegetarianFriendly, setVegetarianFriendly] = useState<boolean | null>(null);
  const [meatServed, setMeatServed] = useState<boolean | null>(null);
  const [allergyFriendly, setAllergyFriendly] = useState<boolean | null>(null);
  const [kosherStatus, setKosherStatus] = useState<NonNullable<Gan["kosher_status"]>>("UNKNOWN");
  const [kosherCertifier, setKosherCertifier] = useState("");
  const [staffChildRatio, setStaffChildRatio] = useState("");
  const [firstAidTrained, setFirstAidTrained] = useState<boolean | null>(null);
  const [languagesSpoken, setLanguagesSpoken] = useState<NonNullable<Gan["languages_spoken"]>>([]);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState<boolean | null>(null);
  const [hasMamad, setHasMamad] = useState<boolean | null>(null);
  const [chugimTypes, setChugimTypes] = useState("");
  const [vacancyStatus, setVacancyStatus] = useState<NonNullable<Gan["vacancy_status"]>>("UNKNOWN");

  const [sectionBasic, setSectionBasic] = useState(true);
  const [sectionContact, setSectionContact] = useState(false);
  const [sectionType, setSectionType] = useState(false);
  const [sectionPrice, setSectionPrice] = useState(false);
  const [sectionHours, setSectionHours] = useState(false);
  const [sectionFood, setSectionFood] = useState(false);
  const [sectionExtra, setSectionExtra] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pinFromAddress, setPinFromAddress] = useState(false);
  const hideSuggestionsTimer = useRef<number | null>(null);
  const lastReverseGeocodedPin = useRef<string | null>(null);

  const canSubmit = useMemo(() => nameHe.trim().length >= 2 && (!!pin || address.trim().length >= 4), [nameHe, pin, address]);

  // When pin is set from map (external), reverse geocode to fill address
  useEffect(() => {
    if (!pin || pinFromAddress) return;
    const key = `${pin.lon},${pin.lat}`;
    if (lastReverseGeocodedPin.current === key) return;
    lastReverseGeocodedPin.current = key;
    (async () => {
      try {
        const res = await fetch(`/api/geocode/reverse?lon=${pin.lon}&lat=${pin.lat}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { place_name?: string | null };
        const placeName = data?.place_name;
        if (typeof placeName === "string" && placeName.trim()) {
          setAddress(placeName.trim());
          const extracted = extractCityFromPlaceName(placeName);
          if (extracted) setCity(extracted);
          setPinFromAddress(true);
        }
      } catch {
        lastReverseGeocodedPin.current = null;
      }
    })();
  }, [pin, pinFromAddress]);

  useEffect(() => {
    const q = address.trim();
    const c = city.trim();
    if (hideSuggestionsTimer.current) {
      window.clearTimeout(hideSuggestionsTimer.current);
      hideSuggestionsTimer.current = null;
    }
    if (q.length < 3) {
      setSuggestions([]);
      setSuggesting(false);
      return;
    }
    const t = window.setTimeout(async () => {
      setSuggesting(true);
      try {
        const params = new URLSearchParams({ q, city: c });
        const res = await fetch(`/api/geocode/suggest?${params}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: GeocodeSuggestion[] };
        const next = Array.isArray(data?.suggestions) ? data.suggestions : [];
        setSuggestions(next);
      } finally {
        setSuggesting(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [address, city]);

  const chooseSuggestion = (s: GeocodeSuggestion) => {
    setError(null);
    setAddress(s.place_name);
    const extractedCity = extractCityFromPlaceName(s.place_name);
    if (extractedCity) setCity(extractedCity);
    onPinChange({ lon: s.lon, lat: s.lat });
    setPinFromAddress(true);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const geocode = async (): Promise<{ lon: number; lat: number } | null> => {
    setError(null);
    const q = address.trim();
    if (q.length < 4) {
      setError("הכנס כתובת כדי לאתר מיקום");
      return null;
    }
    setGeocoding(true);
    try {
      const params = new URLSearchParams({ q, city: city.trim() });
      const res = await fetch(`/api/geocode?${params}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(e?.error || "Geocode failed");
      }
      const data = (await res.json()) as { lat: number; lon: number; display_name?: string | null };
      if (typeof data?.lat !== "number" || typeof data?.lon !== "number") {
        throw new Error("לא נמצא מיקום לכתובת");
      }
      const extractedCity = data?.display_name ? extractCityFromPlaceName(data.display_name) : null;
      if (extractedCity) setCity(extractedCity);
      const next = { lat: data.lat, lon: data.lon };
      onPinChange(next);
      setPinFromAddress(true);
      return next;
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאת ג׳אוקודינג");
      return null;
    } finally {
      setGeocoding(false);
    }
  };

  const effectiveCategory = ganTypeChoice === "OTHER" ? "UNSPECIFIED" : (ganTypeChoice as Gan["category"]);
  const buildMetadata = (): Record<string, unknown> => {
    const meta: Record<string, unknown> = {
      source: "user_suggestion",
      suggested_type: suggestedType?.trim() || undefined,
      pikuach_ironi: pikuachIroni,
      cctv_access: cctvAccess,
      neighborhood: neighborhood?.trim() || undefined,
    };
    const phoneNumbers = phones.map((p) => p.number.trim()).filter(Boolean);
    if (phoneNumbers.length) {
      meta.phone = phoneNumbers;
      meta.phone_whatsapp = phones.filter((p) => p.number.trim() && p.whatsapp).map((p) => p.number.trim());
    }
    return meta;
  };

  const suggest = async () => {
    setError(null);
    if (!user) {
      setError("נדרשת התחברות (Google) כדי להציע גן. אפשר לפרסם המלצה כאנונימי לאחר ההתחברות.");
      return;
    }
    let coords = pin;
    if (!coords) coords = await geocode();
    if (!coords) {
      setError("בחר מיקום במפה או הכנס כתובת כדי לאתר מיקום");
      return;
    }
    if (!supabase) {
      setError("Supabase לא מוגדר");
      return;
    }
    setSaving(true);
    try {
      const meta = buildMetadata();
      const { data, error: rpcError } = await supabase
        .rpc("suggest_gan", {
          p_name_he: nameHe.trim(),
          p_lon: coords.lon,
          p_lat: coords.lat,
          p_address: address.trim() || null,
          p_city: city.trim() || null,
          p_metadata: {
            ...meta,
            website_url: websiteUrl?.trim() || undefined,
            category: effectiveCategory,
            maon_symbol_code: category === "MAON_SYMBOL" ? maonSymbolCode?.trim() || undefined : undefined,
            private_supervision: category === "PRIVATE_GAN" ? privateSupervision : undefined,
            mishpachton_affiliation: category === "MISHPACHTON" ? mishpachtonAffiliation : undefined,
            municipal_grade: category === "MUNICIPAL_GAN" ? municipalGrade : undefined,
            monthly_price_nis: priceFree ? 0 : monthlyPrice ? Number(monthlyPrice) : undefined,
            price_notes: priceFree ? (priceNotes?.trim() ? `מחיר חופשי, ${priceNotes.trim()}` : "מחיר חופשי") : priceNotes?.trim() || undefined,
            min_age_months: minAgeYears ? Math.round(parseFloat(minAgeYears) * 12) : undefined,
            max_age_months: maxAgeYears ? Math.round(parseFloat(maxAgeYears) * 12) : undefined,
            operating_hours: operatingHours?.trim() || undefined,
            friday_schedule: fridaySchedule,
            meal_type: mealType,
            vegan_friendly: veganFriendly,
            vegetarian_friendly: vegetarianFriendly,
            meat_served: meatServed,
            allergy_friendly: allergyFriendly,
            kosher_status: kosherStatus,
            kosher_certifier: kosherCertifier?.trim() || undefined,
            staff_child_ratio: staffChildRatio ? parseFloat(staffChildRatio) : undefined,
            first_aid_trained: firstAidTrained,
            languages_spoken: languagesSpoken.length ? languagesSpoken : undefined,
            has_outdoor_space: hasOutdoorSpace,
            has_mamad: hasMamad,
            chugim_types: chugimTypes?.trim() ? chugimTypes.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
            vacancy_status: vacancyStatus,
          },
        })
        .single();
      if (rpcError) throw rpcError;
      onSuggested({
        id: String(data),
        name_he: nameHe.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        lat: coords.lat,
        lon: coords.lon,
        suggested_type: suggestedType?.trim() || undefined,
        pikuach_ironi: pikuachIroni,
        cctv_access: cctvAccess,
        pending: true,
      });
      onClose();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאה בהצעת גן");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew";
  const selectCls = "w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew bg-white";
  const labelCls = "block text-xs text-gray-600 mb-1 font-hebrew";

  return (
    <Card className="overflow-hidden max-h-[90vh] flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2 shrink-0">
        <div className="min-w-0">
          <CardTitle className="font-hebrew text-lg truncate">הוסף גן (לא מאומת)</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5 font-hebrew">
            ההצעה תיבדק ותופיע במפה לאחר אישור. ניתן למלא כמה שיותר פרטים.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 flex flex-col min-h-0 overflow-hidden">
        {pickingPin ? (
          <div className="py-3 px-4 bg-gan-muted/50 rounded-lg font-hebrew text-sm text-gan-dark">
            לחץ על המפה לבחירת מיקום
          </div>
        ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          <Section title="פרטים בסיסיים (חובה)" open={sectionBasic} onToggle={() => setSectionBasic(!sectionBasic)}>
            <div>
              <label className={labelCls}>שם הגן (חובה)</label>
              <input value={nameHe} onChange={(e) => setNameHe(e.target.value)} className={inputCls} placeholder="לדוגמה: גן אור" />
            </div>
            <div>
              <label className={labelCls}>כתובת</label>
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <input
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setShowSuggestions(true);
                      setError(null);
                      if (pin && pinFromAddress) {
                        onPinChange(null);
                        setPinFromAddress(false);
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => {
                      hideSuggestionsTimer.current = window.setTimeout(() => {
                        setShowSuggestions(false);
                        if (address.trim().length >= 4 && !pin && !geocoding) {
                          geocode();
                        }
                      }, 150);
                    }}
                    className={inputCls}
                    placeholder="דוד בלוך 43, תל אביב-יפו"
                    autoComplete="off"
                  />
                  {showSuggestions && (
                    <div className="absolute z-20 mt-1 w-full">
                      {suggesting ? (
                        <div className="rounded-lg border bg-white shadow-lg px-3 py-2 text-xs text-gray-600 font-hebrew">מחפש כתובות…</div>
                      ) : suggestions.length > 0 ? (
                        <div className="rounded-lg border bg-white shadow-lg overflow-auto max-h-56">
                          {suggestions.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              className="w-full text-right px-3 py-2 text-sm font-hebrew hover:bg-gray-50 border-b last:border-b-0"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                chooseSuggestion(s);
                              }}
                            >
                              {s.place_name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={onRequestPin} className="gap-1.5 shrink-0" title="בחר מיקום במפה">
                  <MapPin className="w-4 h-4" />
                  <span className="hidden sm:inline">בחר במפה</span>
                </Button>
              </div>
            </div>
            <div>
              <label className={labelCls}>שכונה (אופציונלי)</label>
              <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputCls} placeholder="שינקין" />
            </div>
            <div>
              <label className={labelCls}>עיר (מתמלא אוטומטית מהכתובת)</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="גבעתיים" />
            </div>
            <div className="text-xs text-gray-600 font-hebrew">
              {pin ? <>מיקום נבחר: {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</> : <>לא נבחר מיקום עדיין</>}
            </div>
          </Section>

          <Section title="יצירת קשר" open={sectionContact} onToggle={() => setSectionContact(!sectionContact)}>
            <div>
              <label className={labelCls}>אתר</label>
              <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} className={inputCls} placeholder="https://..." inputMode="url" />
            </div>
            <div>
              <label className={labelCls}>טלפון</label>
              <div className="space-y-2">
                {phones.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={entry.number}
                      onChange={(e) =>
                        setPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, number: e.target.value } : p)))
                      }
                      className={`flex-1 ${inputCls}`}
                      placeholder="050-1234567"
                      inputMode="tel"
                    />
                    <label className="flex items-center gap-1.5 shrink-0 cursor-pointer font-hebrew text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={entry.whatsapp}
                        onChange={(e) =>
                          setPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, whatsapp: e.target.checked } : p)))
                        }
                        className="rounded border-gan-accent/50"
                      />
                      <span>וואטסאפ</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPhones((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-500 hover:text-red-600 rounded"
                      aria-label="הסר"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPhones((prev) => [...prev, { number: "", whatsapp: true }])}
                  className="inline-flex items-center gap-1.5 text-sm text-gan-primary hover:underline font-hebrew"
                >
                  <Plus className="w-4 h-4" />
                  הוסף מספר
                </button>
              </div>
            </div>
          </Section>

          <Section title="סוג גן ופיקוח" open={sectionType} onToggle={() => setSectionType(!sectionType)}>
            <div>
              <label className={labelCls}>סוג גן</label>
              <select value={ganTypeChoice} onChange={(e) => { const v = e.target.value; setGanTypeChoice(v); setCategory(v === "OTHER" ? "UNSPECIFIED" : v as Gan["category"]); }} className={selectCls}>
                <option value="UNSPECIFIED">לא ידוע</option>
                <option value="MAON_SYMBOL">מעון סמל</option>
                <option value="PRIVATE_GAN">גן פרטי</option>
                <option value="MISHPACHTON">משפחתון</option>
                <option value="MUNICIPAL_GAN">גן עירוני</option>
                <option value="OTHER">אחר (טקסט חופשי)</option>
              </select>
            </div>
            {ganTypeChoice === "OTHER" && (
              <div>
                <label className={labelCls}>סוג גן (טקסט חופשי)</label>
                <input value={suggestedType} onChange={(e) => setSuggestedType(e.target.value)} className={inputCls} placeholder="גן עירייה, פרטי, מעון יום..." />
              </div>
            )}
            {ganTypeChoice === "MAON_SYMBOL" && (
              <div>
                <label className={labelCls}>סמל מעון</label>
                <input value={maonSymbolCode} onChange={(e) => setMaonSymbolCode(e.target.value)} className={inputCls} placeholder="73874" inputMode="numeric" />
              </div>
            )}
            {ganTypeChoice === "PRIVATE_GAN" && (
              <div>
                <label className={labelCls}>מפוקח?</label>
                <select value={privateSupervision} onChange={(e) => setPrivateSupervision(e.target.value as any)} className={selectCls}>
                  <option value="UNKNOWN">לא ידוע</option>
                  <option value="SUPERVISED">מפוקח</option>
                  <option value="NOT_SUPERVISED">לא מפוקח</option>
                </select>
              </div>
            )}
            {ganTypeChoice === "MISHPACHTON" && (
              <div>
                <label className={labelCls}>פרטי או תמ״ת?</label>
                <select value={mishpachtonAffiliation} onChange={(e) => setMishpachtonAffiliation(e.target.value as any)} className={selectCls}>
                  <option value="UNKNOWN">לא ידוע</option>
                  <option value="PRIVATE">פרטי</option>
                  <option value="TAMAT">תמ״ת</option>
                </select>
              </div>
            )}
            {ganTypeChoice === "MUNICIPAL_GAN" && (
              <div>
                <label className={labelCls}>טט״ח/ט״ח/חובה</label>
                <select value={municipalGrade} onChange={(e) => setMunicipalGrade(e.target.value as any)} className={selectCls}>
                  <option value="UNKNOWN">לא ידוע</option>
                  <option value="TTAH">טט״ח</option>
                  <option value="TAH">ט״ח</option>
                  <option value="HOVA">חובה</option>
                </select>
              </div>
            )}
            <div>
              <label className={labelCls}>פיקוח עירוני</label>
              <select
                value={pikuachIroni === null ? "unknown" : pikuachIroni ? "yes" : "no"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "yes") setPikuachIroni(true);
                  else if (v === "no") setPikuachIroni(false);
                  else setPikuachIroni(null);
                }}
                className={selectCls}
              >
                <option value="unknown">לא ידוע</option>
                <option value="yes">קיים</option>
                <option value="no">לא קיים</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>CCTV</label>
              <select
                value={cctvAccess ?? "unknown"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "none" || v === "exceptional" || v === "online") setCctvAccess(v);
                  else setCctvAccess(null);
                }}
                className={selectCls}
              >
                <option value="unknown">לא ידוע</option>
                <option value="none">אין</option>
                <option value="exceptional">יש (פתוח למקרים חריגים)</option>
                <option value="online">יש ואפשר להתחבר אונליין</option>
              </select>
            </div>
          </Section>

          <Section title="מחיר וגילאים" open={sectionPrice} onToggle={() => setSectionPrice(!sectionPrice)}>
            <div>
              <label className="flex items-center gap-2 cursor-pointer font-hebrew text-sm mb-1">
                <input type="checkbox" checked={priceFree} onChange={(e) => setPriceFree(e.target.checked)} className="rounded border-gan-accent/50" />
                מחיר חופשי
              </label>
              {!priceFree && (
                <div>
                  <label className={labelCls}>מחיר חודשי (₪)</label>
                  <input value={monthlyPrice} onChange={(e) => setMonthlyPrice(e.target.value)} className={inputCls} placeholder="4200" inputMode="numeric" />
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>הערת מחיר</label>
              <input value={priceNotes} onChange={(e) => setPriceNotes(e.target.value)} className={inputCls} placeholder="כולל אוכל, צהרון..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>גיל מינימום (שנים)</label>
                <input value={minAgeYears} onChange={(e) => setMinAgeYears(e.target.value)} className={inputCls} placeholder="0.5" inputMode="decimal" />
              </div>
              <div>
                <label className={labelCls}>גיל מקסימום (שנים)</label>
                <input value={maxAgeYears} onChange={(e) => setMaxAgeYears(e.target.value)} className={inputCls} placeholder="3" inputMode="decimal" />
              </div>
            </div>
            <div>
              <label className={labelCls}>יחס צוות-ילד</label>
              <input value={staffChildRatio} onChange={(e) => setStaffChildRatio(e.target.value)} className={inputCls} placeholder="0.33 = 1:3" inputMode="decimal" />
            </div>
          </Section>

          <Section title="שעות פעילות" open={sectionHours} onToggle={() => setSectionHours(!sectionHours)}>
            <div>
              <label className={labelCls}>שעות פעילות</label>
              <input value={operatingHours} onChange={(e) => setOperatingHours(e.target.value)} className={inputCls} placeholder="07:30–16:00, א'-ה'" />
            </div>
            <div>
              <label className={labelCls}>ימי שישי</label>
              <select value={fridaySchedule} onChange={(e) => setFridaySchedule(e.target.value as any)} className={selectCls}>
                <option value="UNKNOWN">לא ידוע</option>
                <option value="NONE">ללא</option>
                <option value="EVERY_FRIDAY">כל שישי</option>
                <option value="EVERY_OTHER_FRIDAY">כל שבועיים</option>
              </select>
            </div>
          </Section>

          <Section title="אוכל" open={sectionFood} onToggle={() => setSectionFood(!sectionFood)}>
            <div>
              <label className={labelCls}>סוג אוכל</label>
              <select value={mealType} onChange={(e) => setMealType(e.target.value as any)} className={selectCls}>
                <option value="UNKNOWN">לא ידוע</option>
                <option value="IN_HOUSE_COOK">בישול במקום</option>
                <option value="EXTERNAL_CATERING">קייטרינג חיצוני</option>
                <option value="PARENTS_BRING">הורים מביאים</option>
                <option value="MIXED">מעורב</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>טבעוני</label>
                <select value={veganFriendly === null ? "" : veganFriendly ? "yes" : "no"} onChange={(e) => setVeganFriendly(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                  <option value="">לא ידוע</option>
                  <option value="yes">כן</option>
                  <option value="no">לא</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>צמחוני</label>
                <select value={vegetarianFriendly === null ? "" : vegetarianFriendly ? "yes" : "no"} onChange={(e) => setVegetarianFriendly(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                  <option value="">לא ידוע</option>
                  <option value="yes">כן</option>
                  <option value="no">לא</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>מגיש בשר</label>
                <select value={meatServed === null ? "" : meatServed ? "yes" : "no"} onChange={(e) => setMeatServed(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                  <option value="">לא ידוע</option>
                  <option value="yes">כן</option>
                  <option value="no">לא</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ידידותי לאלרגיות</label>
                <select value={allergyFriendly === null ? "" : allergyFriendly ? "yes" : "no"} onChange={(e) => setAllergyFriendly(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                  <option value="">לא ידוע</option>
                  <option value="yes">כן</option>
                  <option value="no">לא</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>כשרות</label>
              <select value={kosherStatus} onChange={(e) => setKosherStatus(e.target.value as any)} className={selectCls}>
                <option value="UNKNOWN">לא ידוע</option>
                <option value="CERTIFIED">כשר</option>
                <option value="NOT_CERTIFIED">לא כשר</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>גוף כשרות</label>
              <input value={kosherCertifier} onChange={(e) => setKosherCertifier(e.target.value)} className={inputCls} placeholder="רבנות, בד״ץ..." />
            </div>
          </Section>

          <Section title="פרטים נוספים" open={sectionExtra} onToggle={() => setSectionExtra(!sectionExtra)}>
            <div>
              <label className={labelCls}>עזרה ראשונה</label>
              <select value={firstAidTrained === null ? "" : firstAidTrained ? "yes" : "no"} onChange={(e) => setFirstAidTrained(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                <option value="">לא ידוע</option>
                <option value="yes">כן</option>
                <option value="no">לא</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>חצר חיצונית</label>
              <select value={hasOutdoorSpace === null ? "" : hasOutdoorSpace ? "yes" : "no"} onChange={(e) => setHasOutdoorSpace(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                <option value="">לא ידוע</option>
                <option value="yes">כן</option>
                <option value="no">לא</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>ממ״ד / מיקלט</label>
              <select value={hasMamad === null ? "" : hasMamad ? "yes" : "no"} onChange={(e) => setHasMamad(e.target.value === "" ? null : e.target.value === "yes")} className={selectCls}>
                <option value="">לא ידוע</option>
                <option value="yes">כן</option>
                <option value="no">לא</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>מקום פנוי</label>
              <select value={vacancyStatus} onChange={(e) => setVacancyStatus(e.target.value as any)} className={selectCls}>
                <option value="UNKNOWN">לא ידוע</option>
                <option value="Available">יש מקום</option>
                <option value="Limited">מקומות מוגבלים</option>
                <option value="Full">מלא / רשימת המתנה</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>שפות</label>
              <div className="flex flex-wrap gap-2">
                {(["HEBREW", "ENGLISH", "RUSSIAN", "ARABIC"] as const).map((lang) => (
                  <label key={lang} className="flex items-center gap-2 text-sm font-hebrew">
                    <input
                      type="checkbox"
                      checked={languagesSpoken.includes(lang)}
                      onChange={(e) => {
                        if (e.target.checked) setLanguagesSpoken([...languagesSpoken, lang]);
                        else setLanguagesSpoken(languagesSpoken.filter((l) => l !== lang));
                      }}
                    />
                    {formatSpokenLanguageHe(lang)}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>חוגים (מופרדים בפסיק)</label>
              <input value={chugimTypes} onChange={(e) => setChugimTypes(e.target.value)} className={inputCls} placeholder="מוזיקה, אמנות, ספורט..." />
            </div>
          </Section>
        </div>
        )}

        {!pickingPin && error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew shrink-0 mt-2">
            {error}
          </div>
        )}

        {!pickingPin && (
        <div className="flex items-center justify-between gap-2 pt-3 shrink-0 border-t border-gan-accent/20 mt-2">
          <div className="text-[11px] text-gray-500 font-hebrew">
            נדרשת התחברות כדי למנוע ספאם.
          </div>
          <Button type="button" size="sm" onClick={suggest} disabled={!canSubmit || saving}>
            {saving ? "שולח..." : "הוסף גן"}
          </Button>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
