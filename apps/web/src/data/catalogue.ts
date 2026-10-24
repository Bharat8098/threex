import type { Manifest, ScoringConfig, Spot, Tile, TileRef } from "@threex/core";
import { type Point, distanceKm, distanceToBoundsKm, geohashBounds } from "./geo.ts";

/** Where the published catalogue lives (the folder holding v1/). */
export const DATA_URL = (
  import.meta.env.VITE_DATA_URL || (import.meta.env.DEV ? "/data" : "https://threex-data.pages.dev")
).replace(/\/$/, "");

async function getJson<T>(path: string): Promise<{ data: T; bytes: ArrayBuffer }> {
  const response = await fetch(`${DATA_URL}/v1/${path}`);
  if (!response.ok) throw new Error(`Catalogue ${path}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  return { data: JSON.parse(new TextDecoder().decode(bytes)) as T, bytes };
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loadManifest(): Promise<Manifest> {
  return (await getJson<Manifest>("manifest.json")).data;
}

export async function loadScoring(manifest: Manifest): Promise<ScoringConfig> {
  return (await getJson<ScoringConfig>(manifest.scoring.path)).data;
}

/** Load a tile and check it against the manifest's hash (it may come from a cache). */
export async function loadTile(ref: TileRef): Promise<Tile> {
  const { data, bytes } = await getJson<Tile>(ref.path);
  if ((await sha256(bytes)) !== ref.sha256)
    throw new Error(`Tile ${ref.geohash} failed its hash check`);
  return data;
}

/** The middle of all the region's tiles: where the map opens before location is known. */
export function regionCentre(manifest: Manifest): Point {
  const boxes = manifest.tiles.map((t) => geohashBounds(t.geohash));
  const south = Math.min(...boxes.map((b) => b.south));
  const north = Math.max(...boxes.map((b) => b.north));
  const west = Math.min(...boxes.map((b) => b.west));
  const east = Math.max(...boxes.map((b) => b.east));
  return { lat: (south + north) / 2, lon: (west + east) / 2 };
}

export function tilesNear(manifest: Manifest, point: Point, radiusKm: number): TileRef[] {
  return manifest.tiles.filter(
    (t) => distanceToBoundsKm(point, geohashBounds(t.geohash)) <= radiusKm,
  );
}

export interface NearbySpot {
  spot: Spot;
  tile: Tile;
  distanceKm: number;
}

export function spotsNear(tiles: Tile[], point: Point, radiusKm: number): NearbySpot[] {
  return tiles
    .flatMap((tile) =>
      tile.spots.map((spot) => ({ spot, tile, distanceKm: distanceKm(point, spot.coordinate) })),
    )
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}
