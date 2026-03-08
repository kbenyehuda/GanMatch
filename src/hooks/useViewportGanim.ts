"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGanimInBounds, type Bounds } from "@/lib/ganim-api";
import type { Gan } from "@/types/ganim";

const DEBOUNCE_MS = 300;
const MAX_CACHE_ENTRIES = 50;
const MIN_MOVE_METERS_FOR_LOADING = 1500; // Zoom/small pan: no loading; only show when panning >1.5km

function pointInBounds(lon: number, lat: number, b: Bounds): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
}

/** Approximate distance in meters between two points (Haversine) */
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
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Returns true if outer fully contains inner */
function boundsContains(outer: Bounds, inner: Bounds): boolean {
  return (
    outer.minLon <= inner.minLon &&
    outer.minLat <= inner.minLat &&
    outer.maxLon >= inner.maxLon &&
    outer.maxLat >= inner.maxLat
  );
}

interface CacheEntry {
  bounds: Bounds;
  ganim: Gan[];
}

export interface UseViewportGanimOptions {
  /** Gan IDs to always keep in view (e.g. newly added, selected) - never filtered out by bounds */
  preserveGanIds?: Set<string>;
}

export interface UseViewportGanimResult {
  ganim: Gan[];
  loading: boolean;
  /** True when waiting for debounce or actively fetching - use to show "thinking" UI */
  pending: boolean;
  error: string | null;
  onBoundsChange: (bounds: Bounds) => void;
  addGan: (gan: Gan) => void;
  refetchViewport: () => void;
}

export function useViewportGanim(options?: UseViewportGanimOptions): UseViewportGanimResult {
  const preserveGanIds = options?.preserveGanIds;
  const [ganim, setGanim] = useState<Gan[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(true); // show loading until first fetch
  const [error, setError] = useState<string | null>(null);
  const currentBoundsRef = useRef<Bounds | null>(null);

  const cacheRef = useRef<CacheEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCenterRef = useRef<{ lon: number; lat: number } | null>(null);
  const hasFetchedOnceRef = useRef(false);

  const applyDelta = useCallback(
    (newData: Gan[], bounds: Bounds) => {
      setGanim((prev) => {
        const byId = new Map(prev.map((g) => [g.id, g]));
        for (const g of newData) byId.set(g.id, g);
        return Array.from(byId.values()).filter(
          (g) =>
            (preserveGanIds?.has(g.id) ?? false) ||
            pointInBounds(g.lon, g.lat, bounds)
        );
      });
    },
    [preserveGanIds]
  );

  const fetchForBounds = useCallback(
    async (
      bounds: Bounds,
      center?: { centerLon: number; centerLat: number },
      forceShowLoading?: boolean
    ) => {
      currentBoundsRef.current = bounds;

      // Only show loading for significant moves (not zoom-only or small pan)
      const centerLon = center?.centerLon ?? (bounds.minLon + bounds.maxLon) / 2;
      const centerLat = center?.centerLat ?? (bounds.minLat + bounds.maxLat) / 2;
      const prev = prevCenterRef.current;
      const isFirstLoad = !hasFetchedOnceRef.current;
      const movedFar =
        !prev ||
        metersBetween(prev.lon, prev.lat, centerLon, centerLat) >
          MIN_MOVE_METERS_FOR_LOADING;
      const shouldShowLoading =
        forceShowLoading || isFirstLoad || movedFar;

      // Cache hit: find a cached entry that contains our bounds
      const cached = cacheRef.current.find((e) => boundsContains(e.bounds, bounds));
      // If cache hit the API limit (1000), it may be incomplete - don't use it when zoomed in
      // to a smaller area; fetch fresh so we get ganim specific to the zoomed viewport.
      const cacheMayBeIncomplete = cached && cached.ganim.length >= 999;
      const boundsMuchSmaller =
        cached &&
        (bounds.maxLon - bounds.minLon) < (cached.bounds.maxLon - cached.bounds.minLon) * 0.5;
      if (cached && !(cacheMayBeIncomplete && boundsMuchSmaller)) {
        const inView = cached.ganim.filter((g) =>
          pointInBounds(g.lon, g.lat, bounds)
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
        const data = await fetchGanimInBounds(bounds);

        // Cache: add new entry, evict oldest if over limit
        cacheRef.current.push({ bounds, ganim: data });
        if (cacheRef.current.length > MAX_CACHE_ENTRIES) {
          cacheRef.current.shift();
        }

        applyDelta(data, bounds);
        setError(null);
        hasFetchedOnceRef.current = true;
      } catch (err) {
        console.error("[useViewportGanim] Fetch error:", err);
        setError(err instanceof Error ? err.message : "שגיאה בטעינת גנים");
      } finally {
        prevCenterRef.current = { lon: centerLon, lat: centerLat };
        setLoading(false);
        setPending(false);
      }
    },
    [applyDelta]
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
      const shouldShowLoading = isFirstLoad || movedFar;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (shouldShowLoading) {
        setPending(true);
      } else {
        setPending(false); // Zoom or small pan - clear immediately
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        fetchForBounds(bounds, { centerLon, centerLat });
      }, DEBOUNCE_MS);
    },
    [fetchForBounds]
  );

  const addGan = useCallback((gan: Gan) => {
    setGanim((prev) => {
      const byId = new Map(prev.map((g) => [g.id, g]));
      byId.set(gan.id, gan);
      return Array.from(byId.values());
    });
  }, []);

  const refetchViewport = useCallback(() => {
    const b = currentBoundsRef.current;
    if (!b) return;
    setPending(true);
    // Invalidate cache so we fetch fresh data (e.g. after user edits)
    cacheRef.current = cacheRef.current.filter(
      (e) => !boundsContains(e.bounds, b)
    );
    fetchForBounds(b, undefined, true); // force show loading for refetch
  }, [fetchForBounds]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { ganim, loading, pending, error, onBoundsChange, addGan, refetchViewport };
}
