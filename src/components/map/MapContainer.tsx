"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  MapLayerMouseEvent,
} from "react-map-gl";
import type { MapRef } from "react-map-gl";
import Supercluster from "supercluster";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";
import type { Place, PlaceCategory } from "@/types/places";
import { PLACE_CATEGORY_COLORS } from "@/types/places";
import { publicEnv } from "@/lib/env/public";

// ─── Pin appearance ──────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  doctor: "🩺",
  cafe: "☕",
  kids: "🧸",
  sport: "⚽",
  attraction: "🎡",
  food: "🍽️",
  cosmetics: "💄",
};

function getPlacePinConfig(place: Place): { color: string; emoji: string } {
  return {
    color: PLACE_CATEGORY_COLORS[place.place_category] ?? "#6B7280",
    emoji: CATEGORY_EMOJI[place.place_category] ?? "📍",
  };
}

// ─── Supercluster types ───────────────────────────────────────────────────────

type PlacePointProps = { place: Place };
type ClusterOrPoint =
  | Supercluster.ClusterFeature<Supercluster.AnyProps>
  | Supercluster.PointFeature<PlacePointProps>;

function isClusterFeature(
  f: ClusterOrPoint
): f is Supercluster.ClusterFeature<Supercluster.AnyProps> {
  return (f as Supercluster.ClusterFeature<Supercluster.AnyProps>)?.properties
    ?.cluster === true;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = publicEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? undefined;

// Centered on Givatayim
const DEFAULT_VIEW = {
  longitude: 34.812,
  latitude: 32.068,
  zoom: 14,
};

const USER_RADIUS_M = 800;
const FOCUS_PLACE_ZOOM = 16;
const ADDRESS_FIT_RADIUS_M = 800;

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function initialViewportFromFocus(focus: {
  lon: number;
  lat: number;
  zoom?: number;
}): { bounds: [number, number, number, number]; zoom: number } {
  const zoom = focus.zoom ?? 16;
  const { lon, lat } = focus;
  const metersPerDegreeLat = 111320;
  const radiusM = 600;
  const dLat = radiusM / metersPerDegreeLat;
  const dLon =
    radiusM / (metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
  return {
    bounds: [lon - dLon, lat - dLat, lon + dLon, lat + dLat],
    zoom,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface MapContainerProps {
  places: Place[];
  selectedPlaceId: string | null;
  onSelectPlace: (place: Place | null) => void;
  onSelectCluster?: (places: Place[]) => void;
  onBoundsChange: (bounds: Bounds) => void;
  onMapClick?: (pos: { lon: number; lat: number }) => void;
  pendingPin?: { lon: number; lat: number } | null;
  fitToAddress?: {
    lon: number;
    lat: number;
    radiusM?: number;
    zoom?: number;
  } | null;
  initialMapFocus?: { lon: number; lat: number; zoom?: number } | null;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MapContainer({
  places,
  selectedPlaceId,
  onSelectPlace,
  onSelectCluster,
  onBoundsChange,
  onMapClick,
  pendingPin,
  fitToAddress,
  initialMapFocus = null,
  loading = false,
}: MapContainerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lon: number;
    lat: number;
  } | null>(null);
  const [hasCenteredOnUser, setHasCenteredOnUser] = useState(() =>
    Boolean(initialMapFocus)
  );
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState(() =>
    initialMapFocus
      ? initialViewportFromFocus(initialMapFocus)
      : {
          bounds: [34.78, 32.05, 34.85, 32.09] as [
            number,
            number,
            number,
            number,
          ],
          zoom: 14,
        }
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const fitToRadius = useCallback(
    (pos: { lon: number; lat: number }, radiusM: number) => {
      const map = mapRef.current;
      if (!map) return;
      const { lon, lat } = pos;
      const metersPerDegreeLat = 111320;
      const dLat = radiusM / metersPerDegreeLat;
      const dLon =
        radiusM / (metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
      map.fitBounds(
        [
          [lon - dLon, lat - dLat],
          [lon + dLon, lat + dLat],
        ],
        { padding: 80, duration: 650 }
      );
    },
    []
  );

  const fitToUserRadius = useCallback(
    (pos: { lon: number; lat: number }) => fitToRadius(pos, USER_RADIUS_M),
    [fitToRadius]
  );

  // One-time geolocation on mount
  useEffect(() => {
    if (!mounted) return;
    if (userLocation || hasCenteredOnUser) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator))
      return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        if (!isFinite(lat) || !isFinite(lon)) return;
        setUserLocation({ lat, lon });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, [mounted, userLocation, hasCenteredOnUser]);

  const updateViewport = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    if (!b) return;
    const bounds: Bounds = {
      minLon: b.getWest(),
      minLat: b.getSouth(),
      maxLon: b.getEast(),
      maxLat: b.getNorth(),
    };
    onBoundsChange(bounds);
    setViewport({
      bounds: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat],
      zoom: Math.floor(map.getZoom() ?? DEFAULT_VIEW.zoom),
    });
  }, [onBoundsChange]);

  const handleMapLoad = useCallback(() => updateViewport(), [updateViewport]);
  const handleMoveEnd = useCallback(() => updateViewport(), [updateViewport]);

  // Pan+zoom to selected place — only once per unique selectedPlaceId
  const lastPannedPlaceId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedPlaceId) { lastPannedPlaceId.current = null; return; }
    // Skip if we already panned to this place (prevents re-pan when `places` refreshes)
    if (lastPannedPlaceId.current === selectedPlaceId) return;
    const map = mapRef.current;
    if (!map) return;
    const place = places.find((p) => p.id === selectedPlaceId);
    if (!place || !isFinite(place.lon) || !isFinite(place.lat)) return;
    lastPannedPlaceId.current = selectedPlaceId;
    const currentZoom = map.getZoom?.() ?? DEFAULT_VIEW.zoom;
    map.easeTo({
      center: [place.lon, place.lat],
      zoom: Math.max(Number(currentZoom), FOCUS_PLACE_ZOOM),
      duration: 650,
    });
  }, [selectedPlaceId, places]);

  // Center on user location (first time)
  useEffect(() => {
    if (!mapRef.current || !userLocation || hasCenteredOnUser) return;
    fitToUserRadius(userLocation);
    setHasCenteredOnUser(true);
  }, [userLocation, hasCenteredOnUser, fitToUserRadius]);

  // Fit to address (search result selection)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitToAddress) return;
    const { lon, lat } = fitToAddress;
    const radiusM = fitToAddress.radiusM ?? ADDRESS_FIT_RADIUS_M;
    const targetZoom = fitToAddress.zoom;
    if (targetZoom != null) {
      map.easeTo({ center: [lon, lat], zoom: targetZoom, duration: 650 });
      const d = 100 / 111320;
      onBoundsChange({
        minLon: lon - d,
        minLat: lat - d,
        maxLon: lon + d,
        maxLat: lat + d,
      });
    } else {
      const metersPerDegreeLat = 111320;
      const dLat = radiusM / metersPerDegreeLat;
      const dLon =
        radiusM / (metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
      onBoundsChange({
        minLon: lon - dLon,
        minLat: lat - dLat,
        maxLon: lon + dLon,
        maxLat: lat + dLat,
      });
      fitToRadius(fitToAddress, radiusM);
    }
  }, [fitToAddress, fitToRadius, onBoundsChange]);

  // ─── Supercluster ──────────────────────────────────────────────────────────

  const index = useMemo(() => {
    const sc = new Supercluster<PlacePointProps>({ radius: 60, maxZoom: 18 });
    sc.load(
      places
        .filter((p) => isFinite(p.lat) && isFinite(p.lon))
        .map((p) => ({
          type: "Feature" as const,
          properties: { place: p },
          geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
          id: p.id,
        }))
    );
    return sc;
  }, [places]);

  const clusters = useMemo(() => {
    const [west, south, east, north] = viewport.bounds;
    return index.getClusters([west, south, east, north], viewport.zoom);
  }, [index, viewport]);

  const getClusterId = useCallback((c: unknown): number | null => {
    const obj = c as Supercluster.ClusterFeature<Supercluster.AnyProps>;
    const id =
      obj?.properties?.cluster_id ??
      (typeof (obj as { id?: unknown })?.id === "number"
        ? (obj as { id: number }).id
        : undefined);
    return typeof id === "number" ? id : null;
  }, []);

  const getClusterPlaces = useCallback(
    (c: unknown, limit = 50): Place[] => {
      const clusterId = getClusterId(c);
      if (clusterId === null) return [];
      try {
        return index
          .getLeaves(clusterId, limit, 0)
          .map((f) => (f.properties as PlacePointProps).place)
          .filter(Boolean);
      } catch {
        return [];
      }
    },
    [getClusterId, index]
  );

  const zoomToCluster = useCallback(
    (c: unknown, center: { lon: number; lat: number }) => {
      const clusterId = getClusterId(c);
      const map = mapRef.current;
      if (!map || clusterId === null) return;
      try {
        map.easeTo({
          center: [center.lon, center.lat],
          zoom: index.getClusterExpansionZoom(clusterId),
          duration: 450,
        });
      } catch {
        // ignore
      }
    },
    [getClusterId, index]
  );

  // Change cursor to crosshair when in pin-picking mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { map.getMap().getCanvas().style.cursor = onMapClick ? "crosshair" : ""; } catch {}
  }, [onMapClick]);

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".mapboxgl-marker")) return;
      if (onMapClick) {
        onMapClick({ lon: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }
      onSelectPlace(null);
    },
    [onMapClick, onSelectPlace]
  );

  // Use mouseup for pin placement — more reliable than onClick which Mapbox
  // swallows when the pointer moves even 1px (treating it as a pan).
  const handleMouseUp = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!onMapClick) return;
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".mapboxgl-marker")) return;
      onMapClick({ lon: e.lngLat.lng, lat: e.lngLat.lat });
    },
    [onMapClick]
  );

  // ─── Render guards ────────────────────────────────────────────────────────

  if (!mounted) {
    return <div className="absolute inset-0 bg-gray-100" />;
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
        <div className="rounded-2xl bg-white p-6 shadow-lg text-center max-w-sm">
          <p className="font-semibold text-gray-800 mb-2">Mapbox Token Required</p>
          <p className="text-sm text-gray-500">
            Set{" "}
            <code className="bg-gray-100 px-1 rounded">
              NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
            </code>{" "}
            in .env.local
          </p>
        </div>
      </div>
    );
  }

  const canLocate =
    mounted && typeof navigator !== "undefined" && "geolocation" in navigator;

  const locateMe = () => {
    if (!canLocate || locating) return;
    if (userLocation) {
      fitToUserRadius(userLocation);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          if (!isFinite(lat) || !isFinite(lon)) return;
          const next = { lat, lon };
          setUserLocation(next);
          fitToUserRadius(next);
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const initialViewState = initialMapFocus
    ? {
        longitude: initialMapFocus.lon,
        latitude: initialMapFocus.lat,
        zoom: initialMapFocus.zoom ?? FOCUS_PLACE_ZOOM,
      }
    : DEFAULT_VIEW;

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={MAPBOX_TOKEN}
      initialViewState={initialViewState}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/light-v11"
      onLoad={handleMapLoad}
      onMoveEnd={handleMoveEnd}
      onClick={onMapClick ? undefined : handleMapClick}
      onMouseUp={onMapClick ? handleMouseUp : undefined}
    >

      {userLocation && (
        <Marker
          key="user-location"
          longitude={userLocation.lon}
          latitude={userLocation.lat}
          anchor="center"
          onClick={(e) => e.originalEvent.stopPropagation()}
        >
          <div className="w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-600/25 shadow" />
        </Marker>
      )}

      {pendingPin && (
        <Marker
          key="pending-pin"
          longitude={pendingPin.lon}
          latitude={pendingPin.lat}
          anchor="bottom"
          onClick={(e) => e.originalEvent.stopPropagation()}
          className="cursor-default"
        >
          <div className="flex items-center justify-center rounded-full bg-amber-500 text-white shadow-lg ring-4 ring-amber-500/30">
            <MapPin className="w-6 h-6" />
          </div>
        </Marker>
      )}

      {/* Selected place — rendered on top if it has been clustered away */}
      {selectedPlaceId &&
        (() => {
          const sel = places.find((p) => p.id === selectedPlaceId);
          if (!sel || !isFinite(sel.lat) || !isFinite(sel.lon)) return null;
          const inClusters = (clusters as ClusterOrPoint[]).some(
            (c) =>
              !isClusterFeature(c) &&
              (c.properties as PlacePointProps).place?.id === selectedPlaceId
          );
          if (inClusters) return null;
          const { color, emoji } = getPlacePinConfig(sel);
          return (
            <Marker
              key={`selected-${sel.id}`}
              longitude={sel.lon}
              latitude={sel.lat}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onSelectPlace(sel);
              }}
              className="cursor-pointer"
            >
              <div
                title={sel.name}
                className="flex items-center justify-center rounded-full text-base shadow-lg scale-125 border-2 border-white"
                style={{
                  backgroundColor: color,
                  width: "2rem",
                  height: "2rem",
                  outline: `3px solid ${color}60`,
                  outlineOffset: "2px",
                }}
              >
                {emoji}
              </div>
            </Marker>
          );
        })()}

      {/* Clusters and individual pins */}
      {(clusters as ClusterOrPoint[]).map((cluster) => {
        const [lon, lat] = cluster.geometry.coordinates;

        if (isClusterFeature(cluster)) {
          const count = cluster.properties.point_count ?? 0;
          const names = getClusterPlaces(cluster, 10)
            .map((p) => p.name)
            .filter(Boolean);
          const tooltip =
            names.length > 0
              ? `${count} מקומות\n${names.join("\n")}${count > names.length ? `\n+${count - names.length} עוד...` : ""}`
              : `${count} מקומות`;
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              longitude={lon}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                zoomToCluster(cluster, { lon, lat });
                const list = getClusterPlaces(cluster, count);
                if (list.length > 0) onSelectCluster?.(list);
              }}
              className="cursor-pointer"
            >
              <div
                title={tooltip}
                className="flex items-center justify-center rounded-full bg-[#0A2B6B] text-white font-semibold text-sm min-w-[28px] h-7 px-2 shadow-md border-2 border-white hover:brightness-95"
              >
                {count}
              </div>
            </Marker>
          );
        }

        const place = (cluster.properties as PlacePointProps).place;
        if (!place) return null;
        const { color, emoji } = getPlacePinConfig(place);
        const isSelected = selectedPlaceId === place.id;

        return (
          <Marker
            key={place.id}
            longitude={lon}
            latitude={lat}
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectPlace(place);
            }}
            className="cursor-pointer"
          >
            <div
              title={place.name}
              className={`flex items-center justify-center rounded-full text-base border-2 border-white shadow-md transition-all duration-150 hover:scale-110 ${isSelected ? "scale-125 shadow-lg" : ""}`}
              style={{
                backgroundColor: color,
                width: "2rem",
                height: "2rem",
                outline: isSelected ? `3px solid ${color}60` : undefined,
                outlineOffset: isSelected ? "2px" : undefined,
              }}
            >
              {emoji}
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
