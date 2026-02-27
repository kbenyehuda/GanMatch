"use client";

import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

export interface SuggestGanResult {
  id: string;
  name_he: string;
  address: string | null;
  city: string | null;
  lat: number;
  lon: number;
}

export function SuggestGanModal({
  onClose,
  pin,
  onPinChange,
  onRequestPin,
  onSuggested,
}: {
  onClose: () => void;
  pin: { lon: number; lat: number } | null;
  onPinChange: (pin: { lon: number; lat: number } | null) => void;
  onRequestPin: () => void;
  onSuggested: (r: SuggestGanResult) => void;
}) {
  const { user } = useSession();
  const [nameHe, setNameHe] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("גבעתיים");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const canSubmit = useMemo(() => nameHe.trim().length >= 2 && (!!pin || address.trim().length >= 4), [nameHe, pin, address]);

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
      const data = (await res.json()) as { lat: number; lon: number };
      if (typeof data?.lat !== "number" || typeof data?.lon !== "number") {
        throw new Error("לא נמצא מיקום לכתובת");
      }
      const next = { lat: data.lat, lon: data.lon };
      onPinChange(next);
      return next;
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאת ג׳אוקודינג");
      return null;
    } finally {
      setGeocoding(false);
    }
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
      const { data, error: rpcError } = await supabase
        .rpc("suggest_gan", {
          p_name_he: nameHe.trim(),
          p_lon: coords.lon,
          p_lat: coords.lat,
          p_address: address.trim() ? address.trim() : null,
          p_city: city.trim() ? city.trim() : null,
          p_metadata: {},
        })
        .single();
      if (rpcError) throw rpcError;
      const id = String(data);
      onSuggested({
        id,
        name_he: nameHe.trim(),
        address: address.trim() ? address.trim() : null,
        city: city.trim() ? city.trim() : null,
        lat: coords.lat,
        lon: coords.lon,
      });
      onClose();
    } catch (e: any) {
      setError(typeof e?.message === "string" ? e.message : "שגיאה בהצעת גן");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
        <div className="min-w-0">
          <CardTitle className="font-hebrew text-lg truncate">הוסף גן (לא מאומת)</CardTitle>
          <p className="text-xs text-gray-500 mt-0.5 font-hebrew">
            מוצג לכולם מיד, ומסומן כ״לא מאומת״ עד אישור.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1 font-hebrew">שם הגן (חובה)</label>
          <input
            value={nameHe}
            onChange={(e) => setNameHe(e.target.value)}
            className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
            placeholder="לדוגמה: גן אור"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">כתובת (או לבחור במפה)</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
              placeholder="רחוב בן גוריון 144"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1 font-hebrew">עיר</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-gan-accent/50 px-3 py-2 text-sm font-hebrew"
              placeholder="גבעתיים"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={geocode} disabled={geocoding}>
              {geocoding ? "מאתר..." : "אתר לפי כתובת"}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onRequestPin} className="gap-2">
              <MapPin className="w-4 h-4" />
              בחר במפה
            </Button>
          </div>
        </div>

        <div className="text-xs text-gray-600 font-hebrew">
          {pin ? (
            <>מיקום נבחר: {pin.lat.toFixed(5)}, {pin.lon.toFixed(5)}</>
          ) : (
            <>לא נבחר מיקום עדיין</>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 font-hebrew">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[11px] text-gray-500 font-hebrew">
            נדרשת התחברות כדי למנוע ספאם. לאחר מכן ניתן לפרסם המלצה כאנונימי.
          </div>
          <Button type="button" size="sm" onClick={suggest} disabled={!canSubmit || saving}>
            {saving ? "שולח..." : "הוסף גן"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

