import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ScoreRequest, ScoreResponse, SpotScore } from "../workers/protocol.ts";
import {
  type NearbySpot,
  loadManifest,
  loadScoring,
  loadTile,
  regionCentre,
  spotsNear,
  tilesNear,
} from "./catalogue.ts";
import { conditionsFor } from "./conditions.ts";
import type { Point } from "./geo.ts";

const RADIUS_KM = 25;
const MAX_SPOTS = 40;

let worker: Worker | undefined;
let nextId = 1;
function scoreInWorker(request: Omit<ScoreRequest, "id">): Promise<SpotScore[]> {
  worker ??= new Worker(new URL("../workers/score.worker.ts", import.meta.url), { type: "module" });
  const id = nextId++;
  return new Promise((resolve) => {
    const listener = (event: MessageEvent<ScoreResponse>) => {
      if (event.data.id !== id) return;
      worker!.removeEventListener("message", listener);
      resolve(event.data.results);
    };
    worker!.addEventListener("message", listener);
    worker!.postMessage({ ...request, id } satisfies ScoreRequest);
  });
}

export interface SpotsState {
  status: "loading" | "ready" | "error";
  error?: string;
  centre?: Point;
  regionName?: string;
  nearby: NearbySpot[];
  scores: Map<string, SpotScore>;
  scoring: boolean;
  /** How many nearby spots are missing some weather data. */
  incomplete: number;
  retryConditions: () => void;
}

/** Spots near `point` (or the region centre), scored for now and the coming week. */
export function useSpots(point: Point | undefined): SpotsState {
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
  const refs = manifest.data && centre ? tilesNear(manifest.data, centre, RADIUS_KM) : [];
  const tiles = useQuery({
    queryKey: ["tiles", refs.map((r) => r.sha256)],
    queryFn: () => Promise.all(refs.map(loadTile)),
    enabled: refs.length > 0,
    staleTime: Infinity,
  });
  const nearby = useMemo(
    () =>
      tiles.data && centre ? spotsNear(tiles.data, centre, RADIUS_KM).slice(0, MAX_SPOTS) : [],
    [tiles.data, centre?.lat, centre?.lon],
  );
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
    let cancelled = false;
    setScoring(true);
    const items = nearby.map(({ spot, tile }) => ({
      spot,
      tile: { ...tile, spots: [], tides: tile.tides.filter((t) => t.id === spot.tideClusterId) },
      conditions: conditions.data.bySpot.get(spot.id) ?? {},
    }));
    scoreInWorker({ config: config.data, from: Date.now(), items }).then((results) => {
      if (cancelled) return;
      setScores(new Map(results.map((r) => [r.spotId, r])));
      setScoring(false);
    });
    return () => {
      cancelled = true;
    };
  }, [config.data, conditions.data, nearby]);

  const error = manifest.error ?? config.error ?? tiles.error;
  return {
    status: error ? "error" : manifest.data && tiles.data ? "ready" : "loading",
    error: error ? String(error.message ?? error) : undefined,
    centre,
    regionName: manifest.data?.region.name,
    nearby,
    scores,
    scoring: scoring || conditions.isFetching,
    incomplete: conditions.isFetching ? 0 : (conditions.data?.incomplete.size ?? 0),
    retryConditions: () => void conditions.refetch(),
  };
}
