"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  MapLayerMouseEvent,
} from "react-map-gl";
import type { MapRef } from "react-map-gl";
import Supercluster from "supercluster";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";
import type { Gan } from "@/types/ganim";

const MAPBOX_TOKEN =
  typeof process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN === "string"
    ? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.trim()
    : undefined;

// Default: Tel Aviv + Givatayim area
const DEFAULT_VIEW = {
  longitude: 34.79,
  latitude: 32.08,
  zoom: 11,
};

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

interface MapContainerProps {
  ganim: Gan[];
  selectedGanId: string | null;
  onSelectGan: (gan: Gan | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
}

export function MapContainer({
  ganim,
  selectedGanId,
  onSelectGan,
  onBoundsChange,
}: MapContainerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [viewport, setViewport] = useState({
    bounds: [34.69, 32.03, 34.88, 32.16] as [number, number, number, number],
    zoom: 11,
  });

  const updateViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    if (b) {
      const bounds: Bounds = {
        minLon: b.getWest(),
        minLat: b.getSouth(),
        maxLon: b.getEast(),
        maxLat: b.getNorth(),
      };
      onBoundsChange(bounds);
      setViewport({
        bounds: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat],
        zoom: Math.floor(map.getZoom() ?? 11),
      });
    }
  }, [onBoundsChange]);

  const handleMapLoad = useCallback(() => {
    updateViewport();
  }, [updateViewport]);

  const handleMoveEnd = useCallback(() => {
    updateViewport();
  }, [updateViewport]);

  const index = useMemo(() => {
    const sc = new Supercluster<Gan>({ radius: 60, maxZoom: 18 });
    sc.load(
      ganim
        .filter((g) => typeof g.lat === "number" && typeof g.lon === "number")
        .map((g) => ({
          type: "Feature" as const,
          properties: { cluster: false, gan: g },
          geometry: {
            type: "Point" as const,
            coordinates: [g.lon, g.lat],
          },
          id: g.id,
        }))
    );
    return sc;
  }, [ganim]);

  const clusters = useMemo(() => {
    const [west, south, east, north] = viewport.bounds;
    return index.getClusters(
      [west - 0.01, south - 0.01, east + 0.01, north + 0.01],
      viewport.zoom
    );
  }, [index, viewport]);

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      // Prevent selecting nothing when clicking the map background
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".mapboxgl-marker")) return;
      onSelectGan(null);
    },
    [onSelectGan]
  );

  if (!MAPBOX_TOKEN) {
    const rawValue = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    const debug = {
      hasRawValue: rawValue !== undefined,
      rawType: typeof rawValue,
      rawLength: typeof rawValue === "string" ? rawValue.length : 0,
      isPlaceholder:
        typeof rawValue === "string" &&
        rawValue.includes("your_") &&
        rawValue.includes("token"),
    };

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gan-muted/50">
        <div className="rounded-lg bg-white p-6 shadow-lg text-center max-w-md">
          <h3 className="font-semibold text-gan-dark mb-2">Mapbox Token Required</h3>
          <p className="text-sm text-gray-600 mb-4">
            Set <code className="bg-gray-100 px-1 rounded">NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> in .env.local or system environment variables.
          </p>
          <div className="text-left text-xs text-gray-500 mb-4 p-3 bg-gray-50 rounded space-y-1 font-mono">
            {debug.rawLength === 0 ? (
              <>
                <p className="text-amber-600 font-medium">
                  Variable exists but value is empty. Ensure the token (starts with pk.) is set correctly.
                </p>
                <p className="mt-1">
                  If using system env vars: open a new terminal (or restart Cursor) so the process sees the updated variables, then run npm run dev.
                </p>
              </>
            ) : debug.isPlaceholder ? (
              <p className="text-amber-600">Replace the example placeholder with your real token.</p>
            ) : null}
            <p>Example: <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.eyJ1...</code></p>
          </div>
          <a
            href="https://account.mapbox.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gan-primary hover:underline"
          >
            Get a free token →
          </a>
        </div>
      </div>
    );
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={DEFAULT_VIEW}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      onLoad={handleMapLoad}
      onMoveEnd={handleMoveEnd}
      onClick={handleMapClick}
    >
      <NavigationControl position="bottom-right" />
      {clusters.map((cluster) => {
        const [lon, lat] = cluster.geometry.coordinates;
        const isCluster = cluster.properties?.cluster;
        if (isCluster) {
          const count = cluster.properties?.point_count ?? 0;
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              longitude={lon}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
              }}
              className="cursor-default"
            >
              <div
                title={`${count} גנים`}
                className="flex items-center justify-center rounded-full bg-gan-secondary text-white font-hebrew font-semibold text-sm min-w-[28px] h-7 px-2 shadow-md border-2 border-white"
              >
                {count}
              </div>
            </Marker>
          );
        }
        const gan = cluster.properties?.gan;
        if (!gan) return null;
        return (
          <Marker
            key={gan.id}
            longitude={lon}
            latitude={lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectGan(gan);
            }}
            className="cursor-pointer"
          >
            <div
              title={gan.name_he}
              className={`flex items-center justify-center rounded-full transition-all duration-150 hover:scale-110 ${
                selectedGanId === gan.id
                  ? "bg-gan-primary text-white ring-4 ring-gan-primary/40 shadow-lg scale-125"
                  : "bg-gan-secondary text-white"
              }`}
            >
              <MapPin className="w-5 h-5" />
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
