"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPlacesInBounds, pointInBounds, type Bounds } from "@/lib/places-api";
import type { Place } from "@/types/places";

const DEBOUNCE_MS = 300;
const MAX_CACHE_ENTRIES = 50;
const MIN_MOVE_METERS_FOR_LOADING = 1500;

function metersBetween(
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number
): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.minLon <= inner.minLon &&
    outer.minLat <= inner.minLat &&
    outer.maxLon >= inner.maxLon &&
    outer.maxLat >= inner.maxLat
  );
}

function categoriesKey(cats: string[] | undefined): string {
  return cats ? [...cats].sort().join(",") : "";
}

interface CacheEntry {
  bounds: Bounds;
  catKey: string;
  places: Place[];
}

export interface UsePlacesInViewportOptions {
  /** If set, only fetch these categories. Changing this value clears the cache and refetches. */
  categories?: string[];
  /** Place IDs to always retain in the result (e.g. newly added, selected) */
  preservePlaceIds?: Set<string>;
}

export interface UsePlacesInViewportResult {
  places: Place[];
  loading: boolean;
  pending: boolean;
  error: string | null;
  onBoundsChange: (bounds: Bounds) => void;
  addPlace: (place: Place) => void;
  refetchViewport: () => void;
}

export function usePlacesInViewport(
  options?: UsePlacesInViewportOptions
): UsePlacesInViewportResult {
  const { categories, preservePlaceIds } = options ?? {};

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentBoundsRef = useRef<Bounds | null>(null);
  const cacheRef = useRef<CacheEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCenterRef = useRef<{ lon: number; lat: number } | null>(null);
  const hasFetchedOnceRef = useRef(false);

  // When categories filter changes, wipe the cache so next fetch is fresh
  const prevCatKeyRef = useRef(categoriesKey(categories));
  const catKey = categoriesKey(categories);
  if (prevCatKeyRef.current !== catKey) {
    prevCatKeyRef.current = catKey;
    cacheRef.current = [];
    hasFetchedOnceRef.current = false;
  }

  const applyDelta = useCallback(
    (incoming: Place[], bounds: Bounds) => {
      setPlaces((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        for (const p of incoming) byId.set(p.id, p);
        return Array.from(byId.values()).filter(
          (p) =>
            (preservePlaceIds?.has(p.id) ?? false) ||
            pointInBounds(p.lon, p.lat, bounds)
        );
      });
    },
    [preservePlaceIds]
  );

  const fetchForBounds = useCallback(
    async (
      bounds: Bounds,
      center?: { centerLon: number; centerLat: number },
      forceShowLoading?: boolean
    ) => {
      currentBoundsRef.current = bounds;

      const centerLon = center?.centerLon ?? (bounds.minLon + bounds.maxLon) / 2;
      const centerLat = center?.centerLat ?? (bounds.minLat + bounds.maxLat) / 2;
      const prev = prevCenterRef.current;
      const isFirstLoad = !hasFetchedOnceRef.current;
      const movedFar =
        !prev ||
        metersBetween(prev.lon, prev.lat, centerLon, centerLat) >
          MIN_MOVE_METERS_FOR_LOADING;
      const shouldShowLoading = forceShowLoading || isFirstLoad || movedFar;

      const currentCatKey = categoriesKey(categories);
      const cached = cacheRef.current.find(
        (e) => e.catKey === currentCatKey && boundsContains(e.bounds, bounds)
      );
      const cacheMayBeIncomplete = cached && cached.places.length >= 499;
      const boundsMuchSmaller =
        cached &&
        bounds.maxLon - bounds.minLon <
          (cached.bounds.maxLon - cached.bounds.minLon) * 0.5;

      if (cached && !(cacheMayBeIncomplete && boundsMuchSmaller)) {
        const inView = cached.places.filter((p) =>
          pointInBounds(p.lon, p.lat, bounds)
        );
        applyDelta(inView, bounds);
        prevCenterRef.current = { lon: centerLon, lat: centerLat };
        setLoading(false);
        setPending(false);
        setError(null);
        hasFetchedOnceRef.current = true;
        return;
      }

      if (shouldShowLoading) setLoading(true);
      setError(null);

      try {
        const data = await fetchPlacesInBounds(
          bounds,
          categories && categories.length > 0 ? categories : undefined
        );

        cacheRef.current.push({ bounds, catKey: currentCatKey, places: data });
        if (cacheRef.current.length > MAX_CACHE_ENTRIES) {
          cacheRef.current.shift();
        }

        applyDelta(data, bounds);
        setError(null);
        hasFetchedOnceRef.current = true;
      } catch (err) {
        console.error("[usePlacesInViewport] fetch error:", err);
        setError(err instanceof Error ? err.message : "שגיאה בטעינת מקומות");
      } finally {
        prevCenterRef.current = { lon: centerLon, lat: centerLat };
        setLoading(false);
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applyDelta, catKey]
  );

  const onBoundsChange = useCallback(
    (bounds: Bounds) => {
      const centerLon = (bounds.minLon + bounds.maxLon) / 2;
      const centerLat = (bounds.minLat + bounds.maxLat) / 2;
      const prev = prevCenterRef.current;
      const isFirstLoad = !hasFetchedOnceRef.current;
      const distanceM = prev
        ? metersBetween(prev.lon, prev.lat, centerLon, centerLat)
        : Infinity;
      const movedFar = !prev || distanceM > MIN_MOVE_METERS_FOR_LOADING;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      setPending(isFirstLoad || movedFar);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        fetchForBounds(bounds, { centerLon, centerLat });
      }, DEBOUNCE_MS);
    },
    [fetchForBounds]
  );

  const addPlace = useCallback((place: Place) => {
    setPlaces((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      byId.set(place.id, place);
      return Array.from(byId.values());
    });
  }, []);

  const refetchViewport = useCallback(() => {
    const b = currentBoundsRef.current;
    if (!b) return;
    setPending(true);
    const currentCatKey = categoriesKey(categories);
    cacheRef.current = cacheRef.current.filter(
      (e) => !(e.catKey === currentCatKey && boundsContains(e.bounds, b))
    );
    fetchForBounds(b, undefined, true);
  }, [fetchForBounds, categories]);

  // Refetch when the category filter changes and we already have a viewport
  useEffect(() => {
    const b = currentBoundsRef.current;
    if (!b) return;
    setPending(true);
    fetchForBounds(b, undefined, true);
    // fetchForBounds is stable relative to catKey; this fires when catKey changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catKey]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { places, loading, pending, error, onBoundsChange, addPlace, refetchViewport };
}
