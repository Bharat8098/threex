// The committed fixture catalogue, read straight from disk.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Manifest, Tile } from "@threex/core";

const repoFile = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

export const readFixture = (path: string): Buffer => readFileSync(repoFile(`fixtures/v1/${path}`));
export const manifest = JSON.parse(readFixture("manifest.json").toString("utf8")) as Manifest;
export const tiles = manifest.tiles.map(
  (ref) => JSON.parse(readFixture(ref.path).toString("utf8")) as Tile,
);
export const spots = tiles.flatMap((t) => t.spots);
export const spot = (name: string) => spots.find((s) => s.name.startsWith(name))!;
