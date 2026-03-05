"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  MapLayerMouseEvent,
} from "react-map-gl";
import type { MapRef } from "react-map-gl";
import Supercluster from "supercluster";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, LocateFixed, MapPin } from "lucide-react";
import type { Gan } from "@/types/ganim";
import { publicEnv } from "@/lib/env/public";

type GanPointProps = { gan: Gan };
type ClusterOrPoint =
  | Supercluster.ClusterFeature<Supercluster.AnyProps>
  | Supercluster.PointFeature<GanPointProps>;

function isClusterFeature(f: ClusterOrPoint): f is Supercluster.ClusterFeature<Supercluster.AnyProps> {
  return (f as any)?.properties?.cluster === true;
}

const MAPBOX_TOKEN = publicEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? undefined;

// Default: Tel Aviv + Givatayim area
const DEFAULT_VIEW = {
  longitude: 34.79,
  latitude: 32.08,
  zoom: 11,
};

const USER_RADIUS_M = 1000;
const FOCUS_GAN_ZOOM = 15.5;

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

const ADDRESS_FIT_RADIUS_M = 1000;

interface MapContainerProps {
  ganim: Gan[];
  selectedGanId: string | null;
  onSelectGan: (gan: Gan | null) => void;
  onSelectCluster?: (ganim: Gan[]) => void;
  onBoundsChange: (bounds: Bounds) => void;
  onMapClick?: (pos: { lon: number; lat: number }) => void;
  pendingPin?: { lon: number; lat: number } | null;
  fitToAddress?: { lon: number; lat: number } | null;
  loading?: boolean;
}

export function MapContainer({
  ganim,
  selectedGanId,
  onSelectGan,
  onSelectCluster,
  onBoundsChange,
  onMapClick,
  pendingPin,
  fitToAddress,
  loading = false,
}: MapContainerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lon: number; lat: number } | null>(null);
  const [hasCenteredOnUser, setHasCenteredOnUser] = useState(false);
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState({
    bounds: [34.69, 32.03, 34.88, 32.16] as [number, number, number, number],
    zoom: 11,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fitToRadius = useCallback((pos: { lon: number; lat: number }, radiusM: number) => {
    const map = mapRef.current;
    if (!map) return;

    const { lon, lat } = pos;
    const metersPerDegreeLat = 111320;
    const dLat = radiusM / metersPerDegreeLat;
    const dLon = radiusM / (metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));

    map.fitBounds(
      [
        [lon - dLon, lat - dLat],
        [lon + dLon, lat + dLat],
      ],
      { padding: 80, duration: 650 }
    );
  }, []);

  const fitToUserRadius = useCallback(
    (pos: { lon: number; lat: number }) => fitToRadius(pos, USER_RADIUS_M),
    [fitToRadius]
  );

  // One-time geolocation lookup (if supported)
  useEffect(() => {
    if (!mounted) return;
    if (userLocation || hasCenteredOnUser) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        if (typeof lat !== "number" || typeof lon !== "number") return;
        if (!isFinite(lat) || !isFinite(lon)) return;
        setUserLocation({ lat, lon });
      },
      () => {
        // Permission denied / unavailable - keep default view silently
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60_000,
      }
    );
  }, [mounted, userLocation, hasCenteredOnUser]);

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

  // When a gan is selected from the UI (search / list / pin), center it and zoom in.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!selectedGanId) return;
    const gan = ganim.find((g) => g.id === selectedGanId);
    if (!gan) return;
    if (typeof gan.lon !== "number" || typeof gan.lat !== "number") return;
    if (!isFinite(gan.lon) || !isFinite(gan.lat)) return;

    const currentZoom = map.getZoom?.() ?? DEFAULT_VIEW.zoom;
    const targetZoom = Math.max(Number(currentZoom) || DEFAULT_VIEW.zoom, FOCUS_GAN_ZOOM);
    map.easeTo({
      center: [gan.lon, gan.lat],
      zoom: targetZoom,
      duration: 650,
    });
  }, [selectedGanId, ganim]);

  // When we have the user's location, fit the map to a 1km radius around it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!userLocation) return;
    if (hasCenteredOnUser) return;

    fitToUserRadius(userLocation);
    setHasCenteredOnUser(true);
  }, [userLocation, hasCenteredOnUser, fitToUserRadius]);

  // When user selects an address from search, fit map to 1km around it and fetch ganim for that area.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!fitToAddress) return;

    const { lon, lat } = fitToAddress;
    const metersPerDegreeLat = 111320;
    const dLat = ADDRESS_FIT_RADIUS_M / metersPerDegreeLat;
    const dLon = ADDRESS_FIT_RADIUS_M / (metersPerDegreeLat * Math.cos((lat * Math.PI) / 180));
    const bounds: Bounds = {
      minLon: lon - dLon,
      minLat: lat - dLat,
      maxLon: lon + dLon,
      maxLat: lat + dLat,
    };
    onBoundsChange(bounds);
    setViewport({
      bounds: [bounds.minLon, bounds.minLat, bounds.maxLon, bounds.maxLat],
      zoom: 14,
    });
    fitToRadius(fitToAddress, ADDRESS_FIT_RADIUS_M);
  }, [fitToAddress, fitToRadius, onBoundsChange]);

  const index = useMemo(() => {
    const sc = new Supercluster<GanPointProps>({ radius: 60, maxZoom: 18 });
    sc.load(
      ganim
        .filter((g) => typeof g.lat === "number" && typeof g.lon === "number")
        .map((g) => ({
          type: "Feature" as const,
          properties: { gan: g },
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
    return index.getClusters([west, south, east, north], viewport.zoom);
  }, [index, viewport]);

  const getClusterId = useCallback((clusterObj: unknown): number | null => {
    const c: any = clusterObj as any;
    const clusterId =
      c?.properties?.cluster_id ??
      (typeof c?.id === "number" ? c.id : undefined) ??
      (typeof c?.properties?.clusterId === "number" ? c.properties.clusterId : undefined);
    return typeof clusterId === "number" ? clusterId : null;
  }, []);

  const getClusterGanim = useCallback(
    (clusterObj: unknown, limit = 50): Gan[] => {
      const clusterId = getClusterId(clusterObj);
      if (clusterId === null) return [];
      try {
        return index
          .getLeaves(clusterId, limit, 0)
          .map((f) => f.properties.gan)
          .filter(Boolean);
      } catch {
        return [];
      }
    },
    [getClusterId, index]
  );

  const zoomToCluster = useCallback(
    (clusterObj: unknown, center: { lon: number; lat: number }) => {
      const clusterId = getClusterId(clusterObj);
      const map = mapRef.current;
      if (!map || clusterId === null) return;
      try {
        const expansionZoom = index.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: [center.lon, center.lat],
          zoom: expansionZoom,
          duration: 450,
        });
      } catch {
        // ignore
      }
    },
    [getClusterId, index]
  );

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      // Prevent selecting nothing when clicking the map background
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".mapboxgl-marker")) return;
      if (onMapClick) {
        onMapClick({ lon: e.lngLat.lng, lat: e.lngLat.lat });
        return;
      }
      onSelectGan(null);
    },
    [onMapClick, onSelectGan]
  );

  if (!mounted) {
    return <div className="absolute inset-0 bg-gan-muted/20" />;
  }

  if (!MAPBOX_TOKEN) {
    const rawValue = publicEnv.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? undefined;
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

  const canLocate =
    mounted && typeof navigator !== "undefined" && "geolocation" in navigator;

  const locateMe = () => {
    if (!canLocate || locating) return;

    // If we already have a recent location, just re-center immediately.
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
          if (typeof lat !== "number" || typeof lon !== "number") return;
          if (!isFinite(lat) || !isFinite(lon)) return;
          const next = { lat, lon };
          setUserLocation(next);
          fitToUserRadius(next);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0,
      }
    );
  };

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
      {loading && (
        <div className="absolute top-3 start-3 z-10 flex items-center gap-2 rounded-md bg-white/95 backdrop-blur px-3 py-2 shadow-md border border-gray-200">
          <Loader2 className="h-4 w-4 animate-spin text-gan-primary" />
          <span className="text-sm font-hebrew text-gray-600">טוען גנים...</span>
        </div>
      )}
      <NavigationControl position="bottom-right" />
      {canLocate ? (
        <div className="absolute bottom-[92px] end-3 z-10">
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            title="אתר אותי"
            aria-label="אתר אותי"
            className="h-10 w-10 rounded-md bg-white/95 backdrop-blur shadow-lg border border-gray-200 flex items-center justify-center hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <LocateFixed className="h-5 w-5 text-gan-dark" />
          </button>
        </div>
      ) : null}
      {userLocation ? (
        <Marker
          key="user-location"
          longitude={userLocation.lon}
          latitude={userLocation.lat}
          anchor="center"
          onClick={(e) => e.originalEvent.stopPropagation()}
        >
          <div className="w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-600/25 shadow" />
        </Marker>
      ) : null}
      {pendingPin ? (
        <Marker
          key="pending-pin"
          longitude={pendingPin.lon}
          latitude={pendingPin.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
          }}
          className="cursor-default"
        >
          <div className="flex items-center justify-center rounded-full bg-amber-500 text-white shadow-lg ring-4 ring-amber-500/30">
            <MapPin className="w-6 h-6" />
          </div>
        </Marker>
      ) : null}
      {(clusters as ClusterOrPoint[]).map((cluster) => {
        const [lon, lat] = cluster.geometry.coordinates;
        if (isClusterFeature(cluster)) {
          const count = cluster.properties.point_count ?? 0;
          const leafNames = getClusterGanim(cluster, 10).map((g) => g.name_he).filter(Boolean);
          const tooltip =
            leafNames.length > 0
              ? `${count} גנים\n` +
                leafNames.join("\n") +
                (count > leafNames.length ? `\n+${count - leafNames.length} עוד...` : "")
              : `${count} גנים`;
          return (
            <Marker
              key={`cluster-${cluster.id}`}
              longitude={lon}
              latitude={lat}
              anchor="center"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                zoomToCluster(cluster, { lon, lat });
                const ganList = getClusterGanim(cluster, 50);
                if (ganList.length > 0) onSelectCluster?.(ganList);
              }}
              className="cursor-pointer"
            >
              <div
                title={tooltip}
                className="flex items-center justify-center rounded-full bg-gan-secondary text-white font-hebrew font-semibold text-sm min-w-[28px] h-7 px-2 shadow-md border-2 border-white hover:brightness-95"
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
