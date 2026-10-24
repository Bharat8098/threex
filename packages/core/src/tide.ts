import type { TideEventKind, TideSeries } from "./generated/contract.ts";
import { HOUR, MINUTE, floorIndex, toMillis } from "./time.ts";

/** Minutes either side of a high or low water that count as "at" high or low tide. */
const TURN_MINUTES = 45;

export interface TideEventAt {
  t: number;
  kind: TideEventKind;
  heightCm: number;
}

/** A tide series prepared for fast lookups. */
export interface TideView {
  id: string;
  start: number;
  stepMs: number;
  heights: readonly number[];
  /** Largest |rate of change| in the series, cm per hour. */
  maxRateCmPerHour: number;
  events: readonly TideEventAt[];
  eventTimes: readonly number[];
}

export type TidePhase = "high" | "low" | "rising" | "falling";

export interface TideStage {
  phase: TidePhase;
  rising: boolean;
  last?: TideEventAt;
  next?: TideEventAt;
  minutesSinceTurn?: number;
  minutesToTurn?: number;
}

export function tideView(series: TideSeries): TideView {
  const start = toMillis(series.start);
  const stepMs = series.stepMinutes * MINUTE;
  const events = series.events.map((e) => ({
    t: toMillis(e.time),
    kind: e.kind,
    heightCm: e.heightCm,
  }));
  const view: TideView = {
    id: series.id,
    start,
    stepMs,
    heights: series.heightsCm,
    maxRateCmPerHour: 0,
    events,
    eventTimes: events.map((e) => e.t),
  };
  let max = 0;
  for (let i = 0; i < series.heightsCm.length; i++) {
    max = Math.max(max, Math.abs(tideRate(view, start + i * stepMs) ?? 0));
  }
  view.maxRateCmPerHour = max;
  return view;
}

/** Catmull-Rom segment containing t: control points and the position within it. */
function segment(view: TideView, t: number) {
  const n = view.heights.length;
  const x = (t - view.start) / view.stepMs;
  if (x < 0 || x > n - 1) return undefined;
  const i = Math.min(Math.floor(x), n - 2);
  const at = (k: number) => view.heights[Math.max(0, Math.min(n - 1, k))]!;
  return { p0: at(i - 1), p1: at(i), p2: at(i + 1), p3: at(i + 2), u: x - i };
}

/** Tide height in cm (relative to the series datum, MSL) at t; undefined outside the series. */
export function tideAt(view: TideView, t: number): number | undefined {
  const s = segment(view, t);
  if (!s) return undefined;
  const { p0, p1, p2, p3, u } = s;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u ** 2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
  );
}

/** Rate of change in cm per hour at t (positive while rising). */
export function tideRate(view: TideView, t: number): number | undefined {
  const s = segment(view, t);
  if (!s) return undefined;
  const { p0, p1, p2, p3, u } = s;
  const perStep =
    0.5 *
    (-p0 +
      p2 +
      2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * u +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 2);
  return perStep * (HOUR / view.stepMs);
}

/** Where t sits in the tide cycle, from the series' published high and low waters. */
export function tideStage(view: TideView, t: number): TideStage | undefined {
  if (tideAt(view, t) === undefined) return undefined;
  const i = floorIndex(view.eventTimes, t);
  const last = i >= 0 ? view.events[i] : undefined;
  const next = view.events[i + 1];
  const minutesSinceTurn = last ? (t - last.t) / MINUTE : undefined;
  const minutesToTurn = next ? (next.t - t) / MINUTE : undefined;
  const rising = next ? next.kind === "high" : last?.kind === "low";
  let phase: TidePhase = rising ? "rising" : "falling";
  if (last && minutesSinceTurn! <= TURN_MINUTES) phase = last.kind;
  else if (next && minutesToTurn! <= TURN_MINUTES) phase = next.kind;
  return { phase, rising, last, next, minutesSinceTurn, minutesToTurn };
}
