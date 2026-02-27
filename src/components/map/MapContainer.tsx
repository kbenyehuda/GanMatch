"use client";

import { useCallback, useRef } from "react";
import Map, {
  Marker,
  NavigationControl,
  MapLayerMouseEvent,
} from "react-map-gl";
import type { MapRef } from "react-map-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";
import type { Gan } from "@/types/ganim";

const MAPBOX_TOKEN =
  typeof process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN === "string"
    ? process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.trim()
    : undefined;

// Default: Tel Aviv center
const DEFAULT_VIEW = {
  longitude: 34.7818,
  latitude: 32.0853,
  zoom: 12,
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

  const handleMapLoad = useCallback(
    (e: { target: { getBounds: () => { getWest: () => number; getSouth: () => number; getEast: () => number; getNorth: () => number } } }) => {
      const b = e.target.getBounds();
      if (b) {
        onBoundsChange({
          minLon: b.getWest(),
          minLat: b.getSouth(),
          maxLon: b.getEast(),
          maxLat: b.getNorth(),
        });
      }
    },
    [onBoundsChange]
  );

  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    if (b) {
      onBoundsChange({
        minLon: b.getWest(),
        minLat: b.getSouth(),
        maxLon: b.getEast(),
        maxLat: b.getNorth(),
      });
    }
  }, [onBoundsChange]);

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
      {ganim.map((gan) => (
        <Marker
          key={gan.id}
          longitude={gan.lon}
          latitude={gan.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelectGan(gan);
          }}
          className="cursor-pointer"
        >
          <div
            className={`flex items-center justify-center rounded-full transition-transform hover:scale-110 ${
              selectedGanId === gan.id
                ? "bg-gan-primary text-white"
                : "bg-gan-secondary text-white"
            }`}
          >
            <MapPin className="w-5 h-5" />
          </div>
        </Marker>
      ))}
    </Map>
  );
}
