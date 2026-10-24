/// <reference lib="webworker" />
import {
  type Conditions,
  type ScoringConfig,
  Sky,
  type Spot,
  type Tile,
  findFlips,
  findWindows,
  scoreSpot,
} from "@threex/core";
import type { ScoreRequest, ScoreResponse, SpotScore } from "./protocol.ts";

const skies = new Map<string, Sky>();
function skyFor(spot: Spot): Sky {
  // Sun and moon times barely change across 10 km: share one Sky per 0.1° cell.
  const key = `${spot.coordinate.lat.toFixed(1)},${spot.coordinate.lon.toFixed(1)}`;
  let sky = skies.get(key);
  if (!sky) skies.set(key, (sky = new Sky(spot.coordinate.lat, spot.coordinate.lon)));
  return sky;
}

function score(
  spot: Spot,
  tile: Tile,
  config: ScoringConfig,
  conditions: Conditions,
  from: number,
): SpotScore {
  const forecast = scoreSpot(spot, tile, config, conditions, { from, sky: skyFor(spot) });
  const now = forecast.steps[0]!;
  const lite = (w: ReturnType<typeof findWindows>[number]) => ({
    start: w.start,
    end: w.end,
    minutes: w.minutes,
    score: w.score,
    tidePhase: w.tidePhase,
    light: w.light,
  });
  return {
    spotId: spot.id,
    now: {
      rating: now.rating,
      statuses: {
        comfort: now.pillars.comfort.status,
        safety: now.pillars.safety.status,
        food: now.pillars.food.status,
      },
      light: now.light,
      tide: now.tide,
    },
    windows: findWindows(forecast, config).slice(0, 3).map(lite),
    flips: findFlips(forecast, config)
      .slice(0, 3)
      .map((f) => ({ start: f.start, end: f.end, missing: f.missing, window: lite(f.window) })),
  };
}

self.onmessage = (event: MessageEvent<ScoreRequest>) => {
  const { id, config, from, items } = event.data;
  const results: SpotScore[] = [];
  for (const item of items) {
    try {
      results.push(score(item.spot, item.tile, config, item.conditions, from));
    } catch (error) {
      console.error(`Scoring ${item.spot.id} failed`, error);
    }
  }
  const response: ScoreResponse = { id, results };
  self.postMessage(response);
};
