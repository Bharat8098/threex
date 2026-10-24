// Pure helpers for the detail and planner screens: they only read ratings the engine
// produced (runs, days, links); nothing here scores.
import type { Point } from "../data/geo.ts";
import type { SpotScore, WindowLite } from "../workers/protocol.ts";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

export interface Run {
  from: number;
  to: number;
  rating: number;
}

/** Consecutive steps with the same rating, clipped to [from, to). */
export function ratingRuns(
  ratings: readonly number[],
  start: number,
  stepMs: number,
  from = start,
  to = start + ratings.length * stepMs,
): Run[] {
  const runs: Run[] = [];
  ratings.forEach((rating, i) => {
    const a = Math.max(start + i * stepMs, from);
    const b = Math.min(start + (i + 1) * stepMs, to);
    if (b <= a) return;
    const last = runs.at(-1);
    if (last && last.rating === rating && last.to === a) last.to = b;
    else runs.push({ from: a, to: b, rating });
  });
  return runs;
}

/** Local midnight at or before `t`, in the device's time zone. */
export function startOfDay(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** The local midnights of `count` days from today (DST-safe: built from calendar dates). */
export function days(now: number, count = 7): number[] {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + i).getTime(),
  );
}

export interface PlannedWindow extends WindowLite {
  spotId: string;
}

/** Each spot's best 3X window starting on the day that begins at `dayStart` (a window
 * belongs to the day it starts on), best first. */
export function bestWindowsOnDay(scores: Iterable<SpotScore>, dayStart: number): PlannedWindow[] {
  const dayEnd = days(dayStart, 2)[1]!;
  const out: PlannedWindow[] = [];
  for (const score of scores) {
    // `windows` is already best first, so the first match is the spot's best that day.
    const best = score.windows.find((w) => w.start >= dayStart && w.start < dayEnd);
    if (best) out.push({ ...best, spotId: score.spotId });
  }
  return out.sort((a, b) => b.score - a.score || a.start - b.start);
}

/** The best rating a spot reaches on a day: 3 with a window, 2 with a flip stretch. */
export function bestOnDay(score: SpotScore | undefined, dayStart: number): number | undefined {
  if (!score) return undefined;
  const dayEnd = days(dayStart, 2)[1]!;
  const overlaps = (w: { start: number; end: number }) => w.start < dayEnd && w.end > dayStart;
  if (score.windows.some(overlaps)) return 3;
  if (score.flips.some(overlaps)) return 2;
  return 1;
}

/** Turn-by-turn directions in the device's maps app. The maps app uses the device's own
 * location; ThreeX passes only the spot. */
export function directionsUrl(point: Point, name: string, apple: boolean): string {
  const at = `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
  return apple
    ? `https://maps.apple.com/?daddr=${at}&q=${encodeURIComponent(name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${at}`;
}

export function isApple(userAgent: string, platform = ""): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent) || platform.startsWith("Mac");
}
