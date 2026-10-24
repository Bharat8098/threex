import type {
  Conditions,
  LightPhase,
  Pillar,
  PillarStatus,
  ScoringConfig,
  Spot,
  Tile,
  TidePhase,
} from "@threex/core";

export interface ScoreRequest {
  id: number;
  config: ScoringConfig;
  from: number;
  /** Each spot with a tile holding only the tide series it needs (keeps messages small). */
  items: { spot: Spot; tile: Tile; conditions: Conditions }[];
}

export interface WindowLite {
  start: number;
  end: number;
  minutes: number;
  score: number;
  tidePhase?: TidePhase;
  light: LightPhase;
}

export interface SpotScore {
  spotId: string;
  now: {
    rating: number;
    statuses: Record<Pillar, PillarStatus>;
    light: LightPhase;
    tide?: { heightCm: number; phase: TidePhase; rising: boolean };
  };
  windows: WindowLite[];
  flips: { start: number; end: number; missing: Pillar; window: WindowLite }[];
}

export interface ScoreResponse {
  id: number;
  results: SpotScore[];
}
