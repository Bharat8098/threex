import type { Conditions } from "./conditions.ts";
import type { ScoringConfig, Spot, Tile } from "./generated/contract.ts";
import { PILLARS, type Pillar, type PillarResult, scorePillar } from "./pillars.ts";
import type { SignalContext } from "./signals.ts";
import { Sky } from "./sky.ts";
import { type TidePhase, type TideView, tideAt, tideStage, tideView } from "./tide.ts";
import { HOUR, MINUTE, toIso, toMillis } from "./time.ts";

export type RatingLabel = "recommended" | "worthALook" | "low";
export type LightPhase = "night" | "dawn" | "day" | "dusk";

export interface StepScore {
  t: number;
  time: string;
  /** Number of X's earned: 0–3. */
  rating: number;
  label: RatingLabel;
  pillars: Record<Pillar, PillarResult>;
  tide?: { heightCm: number; phase: TidePhase; rising: boolean };
  light: LightPhase;
}

export interface SpotForecast {
  spot: Spot;
  stepMinutes: number;
  steps: StepScore[];
}

export interface ScoreOptions {
  /** First moment to score (rounded down to the step). Defaults to now. */
  from?: Date | number | string;
  /** How far ahead to score. Defaults to `config.planner.horizonHours`. */
  hours?: number;
  /** Reuse one Sky for spots close together (the sun and moon don't care about a few km). */
  sky?: Sky;
}

/** Score one moment. `scoreSpot` calls this once per step. */
export function scoreAt(
  spot: Spot,
  config: ScoringConfig,
  conditions: Conditions,
  tide: TideView | undefined,
  sky: Sky,
  time: Date | number | string,
): StepScore {
  const t = toMillis(time);
  const ctx: SignalContext = { spot, config, conditions, tide, sky, t };
  const scoring = config.waterTypes[spot.waterType];
  const pillars = Object.fromEntries(
    PILLARS.map((p) => [p, scorePillar(p, scoring[p], ctx)]),
  ) as Record<Pillar, PillarResult>;
  const rating = PILLARS.filter((p) => pillars[p].earned).length;
  const label: RatingLabel =
    rating >= config.rating.recommendedMinX
      ? "recommended"
      : rating >= config.rating.worthALookMinX
        ? "worthALook"
        : "low";
  const height = tide ? tideAt(tide, t) : undefined;
  const stage = tide ? tideStage(tide, t) : undefined;
  return {
    t,
    time: toIso(t),
    rating,
    label,
    pillars,
    ...(height !== undefined &&
      stage && {
        tide: { heightCm: Math.round(height), phase: stage.phase, rising: stage.rising },
      }),
    light: lightPhase(sky, t),
  };
}

function lightPhase(sky: Sky, t: number): LightPhase {
  const near = sky.nearest(t, ["sunrise", "sunset"]);
  if (near && near.minutes <= 90) return near.event.kind === "sunrise" ? "dawn" : "dusk";
  return sky.sunAltitude(t) > 0 ? "day" : "night";
}

/** The tide series a spot uses, from its tile. */
export function spotTide(spot: Spot, tile: Tile): TideView | undefined {
  if (!spot.tideClusterId) return undefined;
  const series = tile.tides.find((s) => s.id === spot.tideClusterId);
  if (!series)
    throw new Error(`Spot ${spot.id} references missing tide series ${spot.tideClusterId}`);
  return tideView(series);
}

/** Score a spot every `config.planner.stepMinutes` across the planning horizon. */
export function scoreSpot(
  spot: Spot,
  tile: Tile,
  config: ScoringConfig,
  conditions: Conditions,
  options: ScoreOptions = {},
): SpotForecast {
  const stepMinutes = config.planner.stepMinutes;
  if (!(stepMinutes > 0)) {
    throw new Error(`Scoring config ${config.version} has no planner.stepMinutes; it predates M2`);
  }
  const step = stepMinutes * MINUTE;
  const from = Math.floor(toMillis(options.from ?? Date.now()) / step) * step;
  const hours = options.hours ?? config.planner.horizonHours;
  const sky = options.sky ?? new Sky(spot.coordinate.lat, spot.coordinate.lon);
  sky.events(from, from + hours * HOUR); // warm the cache once for the whole range
  const tide = spotTide(spot, tile);
  const steps: StepScore[] = [];
  for (let t = from; t < from + hours * HOUR; t += step) {
    steps.push(scoreAt(spot, config, conditions, tide, sky, t));
  }
  return { spot, stepMinutes, steps };
}
