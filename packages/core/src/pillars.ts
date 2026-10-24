import { membership } from "./band.ts";
import type { PillarScoring, SignalId } from "./generated/contract.ts";
import { SIGNALS, type SignalContext } from "./signals.ts";

export type Pillar = "comfort" | "safety" | "food";
export const PILLARS: readonly Pillar[] = ["comfort", "safety", "food"];

export interface SignalResult {
  signal: SignalId;
  weight: number;
  value?: number;
  membership?: number;
  detail?: Record<string, string | number>;
}

/** Why a pillar scored as it did: a signal that clearly helped or hurt. Localised by the UI. */
export interface Reason {
  signal: SignalId;
  polarity: "positive" | "negative";
  value: number;
  membership: number;
  detail?: Record<string, string | number>;
}

export type PillarStatus = "earned" | "missed" | "unknown";

export interface PillarResult {
  pillar: Pillar;
  status: PillarStatus;
  earned: boolean;
  /** Weighted mean membership of the signals that had data. */
  score?: number;
  /** Share of the pillar's signal weight that had data. */
  coverage: number;
  threshold: number;
  /** score − threshold. */
  margin?: number;
  signals: SignalResult[];
  reasons: Reason[];
}

const MAX_REASONS = 3;
/** Memberships are floored before a geometric mean so one zero doesn't erase the evidence. */
const GEOMETRIC_FLOOR = 0.05;

export function scorePillar(
  pillar: Pillar,
  scoring: PillarScoring,
  ctx: SignalContext,
): PillarResult {
  const signals: SignalResult[] = [];
  const geometric = scoring.combine === "geometric";
  let totalWeight = 0;
  let dataWeight = 0;
  let weighted = 0;
  for (const [id, band] of Object.entries(scoring.signals) as [
    SignalId,
    NonNullable<PillarScoring["signals"][SignalId]>,
  ][]) {
    totalWeight += band.weight;
    const reading = SIGNALS[id](ctx);
    if (!reading) {
      signals.push({ signal: id, weight: band.weight });
      continue;
    }
    const m = membership(reading.value, band);
    dataWeight += band.weight;
    weighted += band.weight * (geometric ? Math.log(Math.max(m, GEOMETRIC_FLOOR)) : m);
    signals.push({
      signal: id,
      weight: band.weight,
      value: reading.value,
      membership: m,
      detail: reading.detail,
    });
  }
  const coverage = totalWeight ? dataWeight / totalWeight : 0;
  const known = coverage >= scoring.minCoverage && dataWeight > 0;
  const mean = dataWeight ? weighted / dataWeight : undefined;
  const score = mean === undefined ? undefined : geometric ? Math.exp(mean) : mean;
  const earned = known && score !== undefined && score >= scoring.threshold;
  return {
    pillar,
    status: !known ? "unknown" : earned ? "earned" : "missed",
    earned,
    score,
    coverage,
    threshold: scoring.threshold,
    margin: known && score !== undefined ? score - scoring.threshold : undefined,
    signals,
    reasons: reasons(signals),
  };
}

function reasons(signals: SignalResult[]): Reason[] {
  const scored = signals.filter((s) => s.membership !== undefined && s.value !== undefined);
  const pick = (polarity: Reason["polarity"]) =>
    scored
      .filter((s) => (polarity === "positive" ? s.membership! >= 0.75 : s.membership! <= 0.25))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_REASONS)
      .map((s) => ({
        signal: s.signal,
        polarity,
        value: s.value!,
        membership: s.membership!,
        ...(s.detail && { detail: s.detail }),
      }));
  return [...pick("positive"), ...pick("negative")];
}
