import type {
  Conditions,
  LightPhase,
  Pillar,
  PillarStatus,
  Reason,
  ScoringConfig,
  Spot,
  TideEventKind,
  Tile,
  TidePhase,
} from "@threex/core";

/** A spot with a tile holding only the tide series it needs (keeps messages small). */
export interface ScoreItem {
  spot: Spot;
  tile: Tile;
  conditions: Conditions;
}

export type WorkerRequest =
  | { id: number; kind: "score"; config: ScoringConfig; from: number; items: ScoreItem[] }
  | { id: number; kind: "detail"; config: ScoringConfig; from: number; item: ScoreItem };

export type WorkerResponse =
  /** Scores arrive in batches, nearest spots first; the last batch has `done`. */
  | { id: number; kind: "score"; results: SpotScore[]; done: boolean }
  | { id: number; kind: "detail"; detail?: SpotDetail };

export interface WindowLite {
  start: number;
  end: number;
  minutes: number;
  score: number;
  tidePhase?: TidePhase;
  light: LightPhase;
}

export interface FlipLite {
  start: number;
  end: number;
  missing: Pillar;
  window: WindowLite;
}

export interface TideNow {
  heightCm: number;
  phase: TidePhase;
  rising: boolean;
}

/** One spot's summary for the list, the map and the week planner. */
export interface SpotScore {
  spotId: string;
  now: {
    rating: number;
    statuses: Record<Pillar, PillarStatus>;
    light: LightPhase;
    tide?: TideNow;
  };
  /** Every 3X window in the horizon, best first. */
  windows: WindowLite[];
  flips: FlipLite[];
}

/** Everything the spot detail screen shows. */
export interface SpotDetail {
  spotId: string;
  start: number;
  stepMs: number;
  /** One entry per step, from `start`: the rating, the tide height and the light. */
  ratings: number[];
  tideCm: (number | null)[];
  light: LightPhase[];
  now: {
    rating: number;
    light: LightPhase;
    tide?: TideNow;
    pillars: Record<
      Pillar,
      { status: PillarStatus; score?: number; threshold: number; reasons: Reason[] }
    >;
  };
  /** When the current rating next changes; undefined if it holds all week. */
  holdsUntil?: number;
  /** The first 3X window that hasn't ended yet. */
  nextWindow?: WindowLite;
  /** Best first. */
  windows: WindowLite[];
  flips: FlipLite[];
  tideEvents: { t: number; kind: TideEventKind; heightCm: number }[];
  conditions: {
    windMs?: number;
    cloud?: number;
    airC?: number;
    seaC?: number;
    seaNormalC?: number;
    waveM?: number;
    currentMs?: number;
    dischargeCumecs?: number;
    medianCumecs?: number;
  };
}
