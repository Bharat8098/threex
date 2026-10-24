import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection } from "geojson";
import {
  AttributionControl,
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibre,
  type MapLayerMouseEvent,
  Marker,
  setWorkerUrl,
} from "maplibre-gl";
// MapLibre finds its worker from a URL built at runtime, which bundlers can't see; importing
// it as an asset makes Vite emit it (and Workbox precache it) and tells MapLibre where it is.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Point } from "../data/geo.ts";
import { color } from "../design/motion.ts";
import { strings } from "../copy/strings.ts";
import styles from "./MapView.module.css";

export interface MapSpot {
  id: string;
  point: Point;
  /** Undefined while the spot is still being scored. */
  rating?: number;
  name: string;
}

interface Props {
  centre: Point | undefined;
  spots: MapSpot[];
  selected?: string;
  onSelect: (id: string) => void;
  scheme: "light" | "dark";
  /** Pixels hidden by the sheet, so fitted views stay visible. */
  padding: { bottom: number; left: number };
  you?: Point;
}

setWorkerUrl(workerUrl);

const STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
} as const;

/** India requires official boundaries on published maps; at fishing zoom levels they add
 * nothing, so every administrative-boundary layer is removed. */
function removeBoundaries(map: MapLibre) {
  for (const layer of map.getStyle().layers) {
    if ("source-layer" in layer && layer["source-layer"] === "boundary") map.removeLayer(layer.id);
  }
}

function features(spots: MapSpot[], selected?: string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: spots.map((s) => ({
      type: "Feature",
      id: s.id,
      geometry: { type: "Point", coordinates: [s.point.lon, s.point.lat] },
      properties: {
        id: s.id,
        rating: s.rating ?? -1,
        label: s.rating === undefined ? "" : `${s.rating}X`,
        name: s.name,
        selected: s.id === selected,
      },
    })),
  };
}

function addSpotLayers(map: MapLibre, spots: MapSpot[], selected?: string) {
  const fill = (rating: string) => color(rating as `--${string}`);
  map.addSource("spots", { type: "geojson", data: features(spots, selected) });
  map.addLayer({
    id: "spots",
    type: "circle",
    source: "spots",
    // Better spots draw on top.
    layout: { "circle-sort-key": ["case", ["get", "selected"], 10, ["get", "rating"]] },
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        ["case", ["get", "selected"], 9, 5],
        12,
        ["case", ["get", "selected"], 11, 7],
        14,
        ["case", ["get", "selected"], 16, 12],
      ],
      "circle-color": [
        "match",
        ["get", "rating"],
        3,
        fill("--rating-3x-fill"),
        2,
        fill("--rating-2x-fill"),
        fill("--sys-gray"),
      ],
      "circle-opacity": ["case", ["<", ["get", "rating"], 0], 0.45, 1],
      "circle-stroke-width": ["case", ["get", "selected"], 3, 1.5],
      "circle-stroke-color": [
        "case",
        ["get", "selected"],
        color("--label"),
        color("--bg-elevated"),
      ],
    },
  });
  map.addLayer({
    id: "spot-labels",
    type: "symbol",
    source: "spots",
    minzoom: 13,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-allow-overlap": true,
    },
    paint: { "text-color": color("--on-fill") },
  });
}

export function MapView({ centre, spots, selected, onSelect, scheme, padding, you }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre>(undefined);
  const youMarker = useRef<Marker>(undefined);
  const latest = useRef({ spots, selected, onSelect });
  latest.current = { spots, selected, onSelect };
  const reduced = useReducedMotion();

  // Create the map once.
  useEffect(() => {
    const instance = new MapLibre({
      container: container.current!,
      style: STYLES[scheme],
      center: centre ? [centre.lon, centre.lat] : [76.27, 10.01],
      zoom: 10.5,
      attributionControl: false,
      pitchWithRotate: false,
      dragRotate: false,
    });
    instance.addControl(new AttributionControl({ compact: true }), "top-right");
    // Start collapsed to the (i) button; it expands on tap.
    instance.once("load", () =>
      container.current
        ?.querySelector(".maplibregl-ctrl-attrib")
        ?.classList.remove("maplibregl-compact-show"),
    );
    instance.touchZoomRotate.disableRotation();
    instance.on("style.load", () => {
      removeBoundaries(instance);
      addSpotLayers(instance, latest.current.spots, latest.current.selected);
    });
    instance.on("click", "spots", (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === "string") latest.current.onSelect(id);
    });
    instance.on("mouseenter", "spots", () => (instance.getCanvas().style.cursor = "pointer"));
    instance.on("mouseleave", "spots", () => (instance.getCanvas().style.cursor = ""));
    map.current = instance;
    return () => instance.remove();
  }, []);

  // Swap basemap with the appearance; spot layers are re-added on style.load.
  useEffect(() => {
    map.current?.setStyle(STYLES[scheme]);
  }, [scheme]);

  // Keep spot data current.
  useEffect(() => {
    const source = map.current?.getSource<GeoJSONSource>("spots");
    source?.setData(features(spots, selected));
  }, [spots, selected]);

  const cameraPadding = {
    top: 140,
    right: 72,
    bottom: padding.bottom + 16,
    left: padding.left + 16,
  };

  // Fly to the selected spot (also once spots arrive, for a page opened on a spot's link).
  const hasSpots = spots.length > 0;
  useEffect(() => {
    const instance = map.current;
    const target = spots.find((s) => s.id === selected)?.point;
    if (!instance || !target) return;
    const camera = {
      center: [target.lon, target.lat] as [number, number],
      zoom: Math.max(instance.getZoom(), 13.5),
      padding: cameraPadding,
    };
    if (reduced) instance.jumpTo(camera);
    else instance.flyTo({ ...camera, duration: 900, essential: false });
  }, [selected, hasSpots]);

  // Frame the nearby spots whenever the centre moves (first load, or after locating).
  const framed = useRef<string>(undefined);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !centre || !spots.length) return;
    const key = `${centre.lat},${centre.lon}`;
    if (framed.current === key) return;
    framed.current = key;
    if (spots.some((s) => s.id === selected)) return; // the selection effect places the camera
    const bounds = new LngLatBounds();
    for (const s of spots) bounds.extend([s.point.lon, s.point.lat]);
    if (you) bounds.extend([you.lon, you.lat]);
    instance.fitBounds(bounds, {
      padding: cameraPadding,
      maxZoom: 14,
      duration: reduced ? 0 : 900,
    });
  }, [centre?.lat, centre?.lon, hasSpots]);

  // "You are here", only when the user asked to be located.
  useEffect(() => {
    if (!map.current) return;
    if (!you) {
      youMarker.current?.remove();
      return;
    }
    const dot = document.createElement("div");
    dot.className = styles.you!;
    dot.setAttribute("aria-label", strings.you);
    youMarker.current?.remove();
    youMarker.current = new Marker({ element: dot })
      .setLngLat([you.lon, you.lat])
      .addTo(map.current);
  }, [you?.lat, you?.lon]);

  return (
    <div
      ref={container}
      className={styles.map}
      data-scheme={scheme}
      role="application"
      aria-label={strings.map}
    />
  );
}
