import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  ConditionKey,
  Conditions,
  Manifest,
  ScoringConfig,
  Spot,
  Tile,
  TideSeries,
} from "../src/index.ts";

export const HOUR = 3_600_000;
export const MINUTE = 60_000;
const M2_PERIOD_HOURS = 12.4206;

export const repoFile = (path: string) =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));
export const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(repoFile(path), "utf8")) as T;

export const config = readJson<ScoringConfig>("config/scoring-config.json");

export function fixtureTiles(): Tile[] {
  const manifest = readJson<Manifest>("fixtures/v1/manifest.json");
  return manifest.tiles.map((ref) => readJson<Tile>(`fixtures/v1/${ref.path}`));
}

export function fixtureSpot(name: string): { spot: Spot; tile: Tile } {
  for (const tile of fixtureTiles()) {
    const spot = tile.spots.find((s) => s.name === name);
    if (spot) return { spot, tile };
  }
  throw new Error(`No fixture spot named ${name}`);
}

/**
 * A pure semidiurnal tide, h = −A·cos(2π(t − low)/T), with exact high and low waters.
 * Lets a scenario put the tide exactly where the story needs it.
 */
export function semidiurnalTide(options: {
  id: string;
  start: string;
  hours: number;
  amplitudeCm: number;
  lowAt: string;
}): TideSeries {
  const start = Date.parse(options.start);
  const low = Date.parse(options.lowAt);
  const period = M2_PERIOD_HOURS * HOUR;
  const end = start + options.hours * HOUR;
  const heightsCm = Array.from({ length: options.hours + 1 }, (_, i) =>
    Math.round(-options.amplitudeCm * Math.cos((2 * Math.PI * (start + i * HOUR - low)) / period)),
  );
  const events: TideSeries["events"] = [];
  for (let k = -20; k <= 20; k++) {
    for (const [offset, kind] of [
      [0, "low"],
      [period / 2, "high"],
    ] as const) {
      const t = low + k * period + offset;
      if (t > start && t < end) {
        events.push({
          time: new Date(t).toISOString(),
          kind,
          heightCm: kind === "high" ? options.amplitudeCm : -options.amplitudeCm,
        });
      }
    }
  }
  events.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  return {
    id: options.id,
    model: "synthetic",
    datum: "MSL",
    start: options.start,
    stepMinutes: 60,
    heightsCm,
    events,
    meanRangeCm: 2 * options.amplitudeCm,
    confidence: 1,
  };
}

/** A spot and tile wired to a scenario's own tide series. */
export function withTide(spot: Spot, tile: Tile, series: TideSeries): { spot: Spot; tile: Tile } {
  return { spot: { ...spot, tideClusterId: series.id }, tile: { ...tile, tides: [series] } };
}

type Value = number | ((t: number) => number);

/** Hourly conditions from constants or functions of time. */
export function conditions(
  values: Partial<Record<ConditionKey, Value>>,
  from: string,
  hours: number,
): Conditions {
  const start = Date.parse(from);
  const times = Array.from({ length: hours + 1 }, (_, i) => start + i * HOUR);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        times,
        values: times.map((t) => (typeof value === "function" ? value(t) : value)),
        kind: "linear",
        span: HOUR,
      },
    ]),
  ) as Conditions;
}
