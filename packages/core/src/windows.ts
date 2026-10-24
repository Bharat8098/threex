import type { ScoringConfig } from "./generated/contract.ts";
import { PILLARS, type Pillar } from "./pillars.ts";
import type { LightPhase, SpotForecast, StepScore } from "./score.ts";
import type { TidePhase } from "./tide.ts";
import { HOUR, MINUTE, toIso } from "./time.ts";

/** Half a semidiurnal tide cycle: a flip must happen on the same tide. */
const SAME_TIDE_MS = 6.2 * HOUR;
/** Windows this long are fully usable; longer ones rank on quality, not length. */
const USABLE_MINUTES = 120;
/** Keeps barely-3X windows rankable rather than scoring zero. */
const QUALITY_FLOOR = 0.1;

export interface Window {
  start: number;
  end: number;
  startTime: string;
  endTime: string;
  minutes: number;
  /** Mean over the window of each pillar's margin above its threshold, averaged. */
  meanMargin: number;
  /** Ranking score: (0.1 + mean margin) × min(1, minutes ÷ 120) × spot confidence. */
  score: number;
  /** The step with the largest total margin. */
  peak: StepScore;
  tidePhase?: TidePhase;
  light: LightPhase;
}

/** A 2X stretch that becomes 3X on the same tide once its missing pillar is earned. */
export interface Flip {
  start: number;
  end: number;
  missing: Pillar;
  window: Window;
}

function margin(step: StepScore): number {
  return PILLARS.reduce((sum, p) => sum + (step.pillars[p].margin ?? 0), 0) / PILLARS.length;
}

function runs(steps: StepScore[], keep: (s: StepScore) => boolean): StepScore[][] {
  const out: StepScore[][] = [];
  let current: StepScore[] = [];
  for (const step of steps) {
    if (keep(step)) current.push(step);
    else if (current.length) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

function toWindow(run: StepScore[], forecast: SpotForecast): Window {
  const stepMs = forecast.stepMinutes * MINUTE;
  const start = run[0]!.t;
  const end = run[run.length - 1]!.t + stepMs;
  const meanMargin = run.reduce((sum, s) => sum + margin(s), 0) / run.length;
  const peak = run.reduce((best, s) => (margin(s) > margin(best) ? s : best));
  const minutes = (end - start) / MINUTE;
  return {
    start,
    end,
    startTime: toIso(start),
    endTime: toIso(end),
    minutes,
    meanMargin,
    score:
      (QUALITY_FLOOR + meanMargin) *
      Math.min(1, minutes / USABLE_MINUTES) *
      forecast.spot.confidence,
    peak,
    ...(peak.tide && { tidePhase: peak.tide.phase }),
    light: peak.light,
  };
}

/** Recommended (3X) windows of at least `planner.minWindowMinutes`, best first. */
export function findWindows(forecast: SpotForecast, config: ScoringConfig): Window[] {
  return runs(forecast.steps, (s) => s.rating >= config.rating.recommendedMinX)
    .map((run) => toWindow(run, forecast))
    .filter((w) => w.minutes >= config.planner.minWindowMinutes)
    .sort((a, b) => b.score - a.score || a.start - b.start);
}

/**
 * For each worth-a-look (2X) stretch, the nearest 3X window on the same tide: the hours
 * when the pillar it was missing is earned too. One flip per window.
 */
export function findFlips(forecast: SpotForecast, config: ScoringConfig): Flip[] {
  const windows = findWindows(forecast, config);
  // Ignore brief dips (a slack-water quarter hour between two windows): a stretch must be
  // as long as a window to be worth reporting.
  const minSteps = Math.ceil(config.planner.minWindowMinutes / forecast.stepMinutes);
  const stretches = runs(
    forecast.steps,
    (s) => s.rating >= config.rating.worthALookMinX && s.rating < config.rating.recommendedMinX,
  ).filter((run) => run.length >= minSteps);
  const flips: Flip[] = [];
  const used = new Set<Window>();
  for (const stretch of stretches) {
    const missing = mostCommonMissing(stretch);
    if (!missing) continue;
    const start = stretch[0]!.t;
    const end = stretch[stretch.length - 1]!.t + forecast.stepMinutes * MINUTE;
    const window = windows
      .filter((w) => !used.has(w) && w.start < end + SAME_TIDE_MS && w.end > start - SAME_TIDE_MS)
      .sort((a, b) => gap(a, start, end) - gap(b, start, end))[0];
    if (!window) continue;
    used.add(window);
    flips.push({ start, end, missing, window });
  }
  return flips.sort((a, b) => a.start - b.start);
}

function gap(window: Window, start: number, end: number): number {
  if (window.end <= start) return start - window.end;
  if (window.start >= end) return window.start - end;
  return 0;
}

function mostCommonMissing(stretch: StepScore[]): Pillar | undefined {
  const counts = new Map<Pillar, number>();
  for (const step of stretch) {
    for (const p of PILLARS) {
      if (!step.pillars[p].earned) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

export interface Pick {
  forecast: SpotForecast;
  window: Window;
}

/** The best upcoming 3X window of each spot, best spots first. */
export function bestUpcoming(forecasts: SpotForecast[], config: ScoringConfig, limit = 10): Pick[] {
  return forecasts
    .flatMap((forecast) => {
      const [window] = findWindows(forecast, config);
      return window ? [{ forecast, window }] : [];
    })
    .sort((a, b) => b.window.score - a.window.score || a.window.start - b.window.start)
    .slice(0, limit);
}
