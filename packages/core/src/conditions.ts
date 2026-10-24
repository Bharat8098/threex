import { floorIndex } from "./time.ts";

/** Weather and water conditions the engine reads, in fixed units. */
export type ConditionKey =
  | "airTempC"
  | "cloudCover" // 0–1
  | "windSpeedMs"
  | "pressureHpa"
  | "seaTempC"
  | "waveHeightM"
  | "currentSpeedMs"
  | "riverDischargeCumecs";

/**
 * A time series of one quantity. `linear` series interpolate between samples; `step` series
 * (daily values) hold each value until the next sample. `null` marks a missing sample.
 */
export interface Series {
  times: number[];
  values: (number | null)[];
  kind: "linear" | "step";
  /** How long the last sample stays valid, in ms (one sample interval). */
  span: number;
}

export type Conditions = Partial<Record<ConditionKey, Series>>;

/** Combine conditions from several providers; later ones win per key. */
export function mergeConditions(...parts: Conditions[]): Conditions {
  return Object.assign({}, ...parts);
}

/** The value of `key` at `t`, or undefined when there is no data for that moment. */
export function valueAt(conditions: Conditions, key: ConditionKey, t: number): number | undefined {
  const series = conditions[key];
  if (!series || series.times.length === 0) return undefined;
  const i = floorIndex(series.times, t);
  if (i < 0) return undefined;
  const t0 = series.times[i]!;
  const v0 = series.values[i];
  if (v0 == null) return undefined;
  if (t === t0) return v0;
  const last = i === series.times.length - 1;
  if (series.kind === "step" || last) {
    return t - t0 < series.span ? v0 : undefined;
  }
  const t1 = series.times[i + 1]!;
  const v1 = series.values[i + 1];
  if (v1 == null) return undefined;
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}
