/// <reference lib="webworker" />
import {
  type Flip,
  type ScoringConfig,
  Sky,
  type Spot,
  type SpotForecast,
  type Window,
  findFlips,
  findWindows,
  scoreSpot,
  valueAt,
} from "@threex/core";
import type {
  FlipLite,
  ScoreItem,
  SpotDetail,
  SpotScore,
  WindowLite,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.ts";

const skies = new Map<string, Sky>();
function skyFor(spot: Spot): Sky {
  // Sun and moon times barely change across 10 km: share one Sky per 0.1° cell.
  const key = `${spot.coordinate.lat.toFixed(1)},${spot.coordinate.lon.toFixed(1)}`;
  let sky = skies.get(key);
  if (!sky) skies.set(key, (sky = new Sky(spot.coordinate.lat, spot.coordinate.lon)));
  return sky;
}

const lite = (w: Window): WindowLite => ({
  start: w.start,
  end: w.end,
  minutes: w.minutes,
  score: w.score,
  tidePhase: w.tidePhase,
  light: w.light,
});
const flipLite = (f: Flip): FlipLite => ({
  start: f.start,
  end: f.end,
  missing: f.missing,
  window: lite(f.window),
});

function forecast({ spot, tile, conditions }: ScoreItem, config: ScoringConfig, from: number) {
  return scoreSpot(spot, tile, config, conditions, { from, sky: skyFor(spot) });
}

function summary(item: ScoreItem, config: ScoringConfig, from: number): SpotScore {
  const result = forecast(item, config, from);
  const now = result.steps[0]!;
  return {
    spotId: item.spot.id,
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
    windows: findWindows(result, config).map(lite),
    flips: findFlips(result, config).map(flipLite),
  };
}

function holdsUntil(result: SpotForecast): number | undefined {
  const first = result.steps[0]!.rating;
  return result.steps.find((s) => s.rating !== first)?.t;
}

function detail(item: ScoreItem, config: ScoringConfig, from: number): SpotDetail {
  const result = forecast(item, config, from);
  const { steps } = result;
  const now = steps[0]!;
  const end = steps.at(-1)!.t;
  const windows = findWindows(result, config).map(lite);
  const pillar = (p: keyof typeof now.pillars) => {
    const { status, score, threshold, reasons } = now.pillars[p];
    return { status, score, threshold, reasons };
  };
  const at = (key: Parameters<typeof valueAt>[1]) => valueAt(item.conditions, key, now.t);
  const month = new Date(now.t).getUTCMonth();
  const series = item.tile.tides.find((t) => t.id === item.spot.tideClusterId);
  return {
    spotId: item.spot.id,
    start: now.t,
    stepMs: result.stepMinutes * 60_000,
    ratings: steps.map((s) => s.rating),
    tideCm: steps.map((s) => (s.tide ? Math.round(s.tide.heightCm) : null)),
    light: steps.map((s) => s.light),
    now: {
      rating: now.rating,
      light: now.light,
      tide: now.tide,
      pillars: { comfort: pillar("comfort"), safety: pillar("safety"), food: pillar("food") },
    },
    holdsUntil: holdsUntil(result),
    nextWindow: windows.filter((w) => w.end > now.t).sort((a, b) => a.start - b.start)[0],
    windows: windows.slice(0, 5),
    flips: findFlips(result, config).slice(0, 3).map(flipLite),
    tideEvents: (series?.events ?? [])
      .map((e) => ({ t: Date.parse(e.time), kind: e.kind, heightCm: e.heightCm }))
      .filter((e) => e.t >= now.t - 6 * 3_600_000 && e.t <= end),
    conditions: {
      windMs: at("windSpeedMs"),
      cloud: at("cloudCover"),
      airC: at("airTempC"),
      seaC: at("seaTempC"),
      seaNormalC: item.spot.habitat.sstNormalC?.[month] ?? undefined,
      waveM: at("waveHeightM"),
      currentMs: at("currentSpeedMs"),
      dischargeCumecs: at("riverDischargeCumecs"),
      medianCumecs: item.spot.river?.dischargeMedianCumecs,
    },
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  if (request.kind === "score") {
    const results: SpotScore[] = [];
    for (const item of request.items) {
      try {
        results.push(summary(item, request.config, request.from));
      } catch (error) {
        console.error(`Scoring ${item.spot.id} failed`, error);
      }
    }
    response = { id: request.id, kind: "score", results };
  } else {
    let result: SpotDetail | undefined;
    try {
      result = detail(request.item, request.config, request.from);
    } catch (error) {
      console.error(`Scoring ${request.item.spot.id} failed`, error);
    }
    response = { id: request.id, kind: "detail", detail: result };
  }
  self.postMessage(response);
};
