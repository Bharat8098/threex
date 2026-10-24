/**
 * One function per signal. Each returns a reading in the signal's own unit (see
 * docs/3x-framework.md), or undefined when there is no data for that moment.
 */
import { type Conditions, valueAt } from "./conditions.ts";
import type { FeatureKind, ScoringConfig, SignalId, Spot } from "./generated/contract.ts";
import type { Sky } from "./sky.ts";
import { type TideView, tideAt, tideRate, tideStage } from "./tide.ts";
import { HOUR } from "./time.ts";

export interface SignalReading {
  value: number;
  detail?: Record<string, string | number>;
}

export interface SignalContext {
  spot: Spot;
  config: ScoringConfig;
  conditions: Conditions;
  tide: TideView | undefined;
  sky: Sky;
  t: number;
}

const NIGHT_FEEDING = 0.3;

/** 1 within `full` metres, falling linearly to 0 at `zero` metres. */
function decay(distance: number | null | undefined, full: number, zero: number): number {
  if (distance == null) return 0;
  if (distance <= full) return 1;
  return Math.max(0, 1 - (distance - full) / (zero - full));
}

function reading(
  value: number | undefined,
  detail?: SignalReading["detail"],
): SignalReading | undefined {
  return value === undefined || Number.isNaN(value) ? undefined : { value, detail };
}

function month(t: number): number {
  return new Date(t).getUTCMonth();
}

/**
 * Shelter from every feature within reach, combined as independent chances of cover:
 * 1 − Π(1 − weight × closeness). Features with a `minTideCm` (mangrove edges) only count
 * once the tide reaches them.
 */
function cover(ctx: SignalContext): SignalReading {
  const height = ctx.tide ? tideAt(ctx.tide, ctx.t) : undefined;
  const { radiusM, kindWeights } = ctx.config.structure;
  let uncovered = 1;
  let best: { kind: FeatureKind; distanceM: number; strength: number } | undefined;
  let submerged = 0;
  for (const feature of ctx.spot.features) {
    if (feature.minTideCm != null && ctx.tide) {
      if (height === undefined || height < feature.minTideCm) {
        submerged++;
        continue; // not flooded yet, so it shelters nothing
      }
    }
    const strength =
      (kindWeights[feature.kind] ?? 0) * Math.max(0, 1 - feature.distanceM / radiusM);
    uncovered *= 1 - strength;
    if (!best || strength > best.strength) {
      best = { kind: feature.kind, distanceM: feature.distanceM, strength };
    }
  }
  const detail: Record<string, string | number> = {};
  if (best) Object.assign(detail, { kind: best.kind, distanceM: best.distanceM });
  if (submerged) detail.dryFeatures = submerged;
  return { value: 1 - uncovered, detail };
}

type SignalFn = (ctx: SignalContext) => SignalReading | undefined;

export const SIGNALS: Record<SignalId, SignalFn> = {
  // Comfort
  // Absolute rate of tide change: big-tide coasts rip, Kerala's gentle tides rarely do.
  tidalFlow: ({ tide, t }) => {
    const rate = tide ? tideRate(tide, t) : undefined;
    if (rate === undefined) return undefined;
    return { value: Math.abs(rate), detail: { rising: rate > 0 ? 1 : 0 } };
  },
  currentSpeed: ({ conditions, t }) => reading(valueAt(conditions, "currentSpeedMs", t)),
  waterTempAnomaly: ({ conditions, spot, t }) => {
    const sst = valueAt(conditions, "seaTempC", t);
    const normal = spot.habitat.sstNormalC?.[month(t)];
    if (sst === undefined || normal == null) return undefined;
    return { value: sst - normal, detail: { seaTempC: sst, normalC: normal } };
  },
  lightLevel: ({ sky, conditions, t }) => {
    const altitude = sky.sunAltitude(t);
    let light: number;
    if (altitude <= -6) light = 0;
    else if (altitude <= 0) light = (0.1 * (altitude + 6)) / 6;
    else
      light = Math.max(
        0.1,
        Math.min(1, Math.sin((altitude * Math.PI) / 180) / Math.sin(Math.PI / 3)),
      );
    const cloud = valueAt(conditions, "cloudCover", t);
    const value = light * (1 - 0.75 * (cloud ?? 0));
    return {
      value,
      detail: { sunAltitude: Math.round(altitude), ...(cloud !== undefined && { cloud }) },
    };
  },
  windSpeed: ({ conditions, t }) => reading(valueAt(conditions, "windSpeedMs", t)),
  waveHeight: ({ conditions, t }) => reading(valueAt(conditions, "waveHeightM", t)),
  dischargeRatio: ({ conditions, spot, t }) => {
    const median = spot.river?.dischargeMedianCumecs;
    const discharge = valueAt(conditions, "riverDischargeCumecs", t);
    if (!median || discharge === undefined) return undefined;
    return {
      value: discharge / median,
      detail: { cumecs: Math.round(discharge), medianCumecs: median },
    };
  },

  // Safety
  cover,
  waterDepth: ({ spot, tide, t }) => {
    if (spot.depthM == null) return undefined;
    const height = tide ? tideAt(tide, t) : 0;
    return reading(height === undefined ? undefined : spot.depthM + height / 100);
  },

  // Food
  nurseryHabitat: ({ spot }) => {
    const h = spot.habitat;
    const options: [string, number][] = [
      ["mangrove", decay(h.mangroveM, 1_000, 10_000)],
      ["weedBed", decay(h.weedBedM, 500, 5_000)],
      ["reef", decay(h.reefM, 1_000, 10_000)],
      ["riverMouth", decay(h.riverMouthM, 2_000, 20_000)],
    ];
    const [habitat, value] = options.reduce((a, b) => (b[1] > a[1] ? b : a));
    return { value, ...(value > 0 && { detail: { habitat } }) };
  },
  chlorophyll: ({ spot, t }) =>
    reading(spot.habitat.chlorophyllNormalMgM3?.[month(t)] ?? undefined),
  tideMovement: ({ tide, t }) => {
    const stage = tide ? tideStage(tide, t) : undefined;
    if (!stage || stage.minutesSinceTurn === undefined) return undefined;
    const since = stage.minutesSinceTurn;
    let value: number;
    if (since < 30) value = since / 30;
    else if (since <= 150 || stage.minutesToTurn === undefined) value = 1;
    else {
      const span = since + stage.minutesToTurn - 150;
      value = 1 - (since - 150) / Math.max(span, 1);
    }
    return { value, detail: { phase: stage.phase, minutesSinceTurn: Math.round(since) } };
  },
  // Dawn and dusk are prime feeding times; night counts for half (many estuary fish feed
  // after dark); bright day counts for nothing.
  lowLightFeeding: ({ sky, t }) => {
    const near = sky.nearest(t, ["sunrise", "sunset"]);
    if (!near) return undefined;
    const twilight = near.minutes <= 60 ? 1 : Math.max(0, 1 - (near.minutes - 60) / 90);
    const night = sky.sunAltitude(t) < -6 ? NIGHT_FEEDING : 0;
    return {
      value: Math.max(twilight, night),
      detail: { event: near.event.kind, minutes: Math.round(near.minutes) },
    };
  },
  pressureTrend: ({ conditions, t }) => {
    const now = valueAt(conditions, "pressureHpa", t);
    const before = valueAt(conditions, "pressureHpa", t - 3 * HOUR);
    if (now === undefined || before === undefined) return undefined;
    return { value: now - before, detail: { hPa: Math.round(now) } };
  },
  solunar: ({ sky, t }) => {
    const major = sky.nearest(t, ["moonTransit", "moonUnderfoot"]);
    const minor = sky.nearest(t, ["moonrise", "moonset"]);
    const score = (near: typeof major, width: number) =>
      !near ? 0 : near.minutes <= width ? 1 : Math.max(0, 1 - (near.minutes - width) / 30);
    const majorScore = score(major, 60);
    const minorScore = score(minor, 45);
    const best = majorScore >= minorScore ? major : minor;
    return {
      value: Math.max(majorScore, minorScore),
      ...(best && { detail: { event: best.event.kind, minutes: Math.round(best.minutes) } }),
    };
  },
};
