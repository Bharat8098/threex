import { useQuery } from "@tanstack/react-query";
import type { Manifest, ScoringConfig } from "@threex/core";
import { useEffect, useMemo, useState } from "react";
import type {
  ScoreItem,
  SpotDetail,
  SpotScore,
  WorkerRequest,
  WorkerResponse,
} from "../workers/protocol.ts";
import {
  type NearbySpot,
  loadManifest,
  loadScoring,
  loadTile,
  regionCentre,
  spotsNear,
  tilesNear,
} from "./catalogue.ts";
import { type SpotConditions, conditionsFor } from "./conditions.ts";
import { type Point, distanceKm } from "./geo.ts";

/** Every spot this close is listed and scored: 3X is an absolute bar, not a ranking, so an
 * angler sees all the places that clear it, however many there are. */
const RADIUS_KM = 25;

type Request = WorkerRequest extends infer R ? (R extends unknown ? Omit<R, "id"> : never) : never;

let worker: Worker | undefined;
let nextId = 1;
/** Sends a request to the scoring worker; `onMessage` sees each response for it until it
 * returns true. */
function post(request: Request, onMessage: (response: WorkerResponse) => boolean): () => void {
  worker ??= new Worker(new URL("../workers/score.worker.ts", import.meta.url), { type: "module" });
  const id = nextId++;
  const listener = (event: MessageEvent<WorkerResponse>) => {
    if (event.data.id === id && onMessage(event.data)) stop();
  };
  const stop = () => worker!.removeEventListener("message", listener);
  worker.addEventListener("message", listener);
  worker.postMessage({ ...request, id } as WorkerRequest);
  return stop;
}

function ask<K extends Request["kind"]>(
  request: Extract<Request, { kind: K }>,
): Promise<Extract<WorkerResponse, { kind: K }>> {
  return new Promise((resolve) =>
    post(request, (response) => {
      resolve(response as Extract<WorkerResponse, { kind: K }>);
      return true;
    }),
  );
}

/** The tile of a spot, from its id (`sp-` + an 8-character geohash). */
export function tileOfSpot(spotId: string): string | undefined {
  return /^sp-[0-9b-hjkmnp-z]{4,}/.test(spotId) ? spotId.slice(3, 7) : undefined;
}

function itemFor(nearby: NearbySpot, conditions: SpotConditions): ScoreItem {
  const { spot, tile } = nearby;
  return {
    spot,
    // Only the spot's own tide series: keeps worker messages small.
    tile: { ...tile, spots: [], tides: tile.tides.filter((t) => t.id === spot.tideClusterId) },
    conditions: conditions.bySpot.get(spot.id) ?? {},
  };
}

export interface SpotsState {
  status: "loading" | "ready" | "error";
  error?: string;
  centre?: Point;
  regionName?: string;
  manifest?: Manifest;
  config?: ScoringConfig;
  nearby: NearbySpot[];
  scores: Map<string, SpotScore>;
  scoring: boolean;
  /** How many nearby spots are missing some weather data. */
  incomplete: number;
  retryConditions: () => void;
  /** Changes whenever new conditions arrive, so details re-score. */
  conditionsAt: number;
  item: (spotId: string) => ScoreItem | undefined;
}

/** Spots near `point` (or the region centre), scored for now and the coming week. `focus` is a
 * spot that must be included even if it is not among the nearest (a shared link). */
export function useSpots(point: Point | undefined, focus?: string): SpotsState {
  const manifest = useQuery({
    queryKey: ["manifest"],
    queryFn: loadManifest,
    staleTime: 3_600_000,
  });
  const config = useQuery({
    queryKey: ["scoring", manifest.data?.scoring.sha256],
    queryFn: () => loadScoring(manifest.data!),
    enabled: !!manifest.data,
    staleTime: Infinity,
  });
  const centre = point ?? (manifest.data ? regionCentre(manifest.data) : undefined);
  const focusTile = focus ? tileOfSpot(focus) : undefined;
  const near = manifest.data && centre ? tilesNear(manifest.data, centre, RADIUS_KM) : [];
  const extra = manifest.data?.tiles.find((t) => t.geohash === focusTile && !near.includes(t));
  const refs = extra ? [...near, extra] : near;
  const tiles = useQuery({
    queryKey: ["tiles", refs.map((r) => r.sha256)],
    queryFn: () => Promise.all(refs.map(loadTile)),
    enabled: refs.length > 0,
    staleTime: Infinity,
  });
  const nearby = useMemo(() => {
    if (!tiles.data || !centre) return [];
    const list = spotsNear(tiles.data, centre, RADIUS_KM);
    if (focus && !list.some((n) => n.spot.id === focus)) {
      for (const tile of tiles.data) {
        const spot = tile.spots.find((s) => s.id === focus);
        if (spot) list.push({ spot, tile, distanceKm: distanceKm(centre, spot.coordinate) });
      }
    }
    return list;
  }, [tiles.data, centre?.lat, centre?.lon, focus]);
  const conditions = useQuery({
    queryKey: ["conditions", nearby.map((n) => n.spot.id)],
    queryFn: () => conditionsFor(nearby.map((n) => n.spot)),
    enabled: nearby.length > 0,
    staleTime: 30 * 60_000,
  });

  const [scores, setScores] = useState(new Map<string, SpotScore>());
  const [scoring, setScoring] = useState(false);
  useEffect(() => {
    if (!config.data || !conditions.data || nearby.length === 0) return;
    setScoring(true);
    const items = nearby.map((n) => itemFor(n, conditions.data));
    const ids = new Set(items.map((i) => i.spot.id));
    // Batches arrive nearest first; each is merged in, so earlier ratings stay on screen
    // until their new ones arrive.
    return post({ kind: "score", config: config.data, from: Date.now(), items }, (response) => {
      if (response.kind !== "score") return false;
      setScores((previous) => {
        const next = new Map(previous);
        for (const r of response.results) next.set(r.spotId, r);
        if (response.done) for (const id of next.keys()) if (!ids.has(id)) next.delete(id);
        return next;
      });
      if (response.done) setScoring(false);
      return response.done;
    });
  }, [config.data, conditions.data, nearby]);

  const error = manifest.error ?? config.error ?? tiles.error;
  return {
    status: error ? "error" : manifest.data && tiles.data ? "ready" : "loading",
    error: error ? String(error.message ?? error) : undefined,
    centre,
    regionName: manifest.data?.region.name,
    manifest: manifest.data,
    config: config.data,
    nearby,
    scores,
    scoring: scoring || conditions.isFetching,
    incomplete: conditions.isFetching ? 0 : (conditions.data?.incomplete.size ?? 0),
    retryConditions: () => void conditions.refetch(),
    conditionsAt: conditions.dataUpdatedAt,
    item: (spotId) => {
      const found = nearby.find((n) => n.spot.id === spotId);
      return found && conditions.data ? itemFor(found, conditions.data) : undefined;
    },
  };
}

/** The full week for one spot, scored on demand for the detail screen. */
export function useSpotDetail(state: SpotsState, spotId: string | undefined) {
  const item = spotId ? state.item(spotId) : undefined;
  return useQuery({
    queryKey: ["detail", spotId, state.conditionsAt, state.config?.version],
    queryFn: async (): Promise<SpotDetail | null> => {
      const { detail } = await ask({
        kind: "detail",
        config: state.config!,
        from: Date.now(),
        item: item!,
      });
      return detail ?? null;
    },
    enabled: !!item && !!state.config,
    staleTime: 5 * 60_000,
  });
}
