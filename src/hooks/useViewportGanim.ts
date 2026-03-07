"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGanimInBounds, type Bounds } from "@/lib/ganim-api";
import type { Gan } from "@/types/ganim";

const DEBOUNCE_MS = 300;
const MAX_CACHE_ENTRIES = 50;

function pointInBounds(lon: number, lat: number, b: Bounds): boolean {
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
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

export function useViewportGanim(): UseViewportGanimResult {
  const [ganim, setGanim] = useState<Gan[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(true); // show loading until first fetch
  const [error, setError] = useState<string | null>(null);
  const currentBoundsRef = useRef<Bounds | null>(null);

  const cacheRef = useRef<CacheEntry[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDelta = useCallback((newData: Gan[], bounds: Bounds) => {
    setGanim((prev) => {
      const byId = new Map(prev.map((g) => [g.id, g]));
      for (const g of newData) byId.set(g.id, g);
      return Array.from(byId.values()).filter((g) =>
        pointInBounds(g.lon, g.lat, bounds)
      );
    });
  }, []);

  const fetchForBounds = useCallback(
    async (bounds: Bounds) => {
      currentBoundsRef.current = bounds;

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
        setLoading(false);
        setPending(false);
        setError(null);
        return;
      }

      setLoading(true);
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
      } catch (err) {
        console.error("[useViewportGanim] Fetch error:", err);
        setError(err instanceof Error ? err.message : "שגיאה בטעינת גנים");
      } finally {
        setLoading(false);
        setPending(false);
      }
    },
    [applyDelta]
  );

  const onBoundsChange = useCallback(
    (bounds: Bounds) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setPending(true);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        fetchForBounds(bounds);
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
    fetchForBounds(b);
  }, [fetchForBounds]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { ganim, loading, pending, error, onBoundsChange, addGan, refetchViewport };
}
