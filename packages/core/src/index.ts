export type * from "./generated/contract.ts";

/** The published-data schema version this package understands. */
export const SCHEMA_VERSION = 1;

export { membership } from "./band.ts";
export {
  type ConditionKey,
  type Conditions,
  type Series,
  mergeConditions,
  valueAt,
} from "./conditions.ts";
export {
  type OpenMeteoOptions,
  floodUrl,
  forecastUrl,
  marineUrl,
  parseFlood,
  parseForecast,
  parseMarine,
} from "./openMeteo.ts";
export {
  PILLARS,
  type Pillar,
  type PillarResult,
  type PillarStatus,
  type Reason,
  type SignalResult,
} from "./pillars.ts";
export {
  type LightPhase,
  type RatingLabel,
  type ScoreOptions,
  type SpotForecast,
  type StepScore,
  scoreAt,
  scoreSpot,
  spotTide,
} from "./score.ts";
export { SIGNALS, type SignalContext, type SignalReading } from "./signals.ts";
export { Sky, type SkyEvent, type SkyEventKind } from "./sky.ts";
export {
  type TidePhase,
  type TideStage,
  type TideView,
  tideAt,
  tideRate,
  tideStage,
  tideView,
} from "./tide.ts";
export {
  type Flip,
  type Pick,
  type Window,
  bestUpcoming,
  findFlips,
  findWindows,
} from "./windows.ts";
