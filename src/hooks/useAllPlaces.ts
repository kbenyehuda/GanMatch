"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAllPlaces } from "@/lib/places-api";
import type { Place } from "@/types/places";

export interface UseAllPlacesResult {
  places: Place[];
  /** True until the first load finishes. */
  loading: boolean;
  error: string | null;
  /** Insert or replace one place locally (after an add / edit) without a refetch. */
  addPlace: (place: Place) => void;
  /** Re-fetches everything. `silent: true` skips the loading state. */
  refetch: (options?: { silent?: boolean }) => void;
}

/**
 * Loads every place in the city once — a few hundred rows. The list and the filter
 * counts work on all of them (like Google Maps, the list doesn't follow the map),
 * and places without a pin still appear in the list.
 */
export function useAllPlaces(): UseAllPlacesResult {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const all = await fetchAllPlaces();
      // Keep locally-added places that the server doesn't return yet.
      setPlaces((prev) => {
        const byId = new Map(all.map((p) => [p.id, p]));
        for (const p of prev) if (!byId.has(p.id)) byId.set(p.id, p);
        return Array.from(byId.values());
      });
      setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "שגיאה בטעינת המקומות");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(false); }, [load]);

  const addPlace = useCallback((place: Place) => {
    setPlaces((prev) => {
      const i = prev.findIndex((p) => p.id === place.id);
      if (i === -1) return [...prev, place];
      const next = [...prev];
      next[i] = place;
      return next;
    });
  }, []);

  const refetch = useCallback((options?: { silent?: boolean }) => { load(options?.silent ?? false); }, [load]);

  return { places, loading, error, addPlace, refetch };
}
