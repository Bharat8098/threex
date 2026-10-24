import { describe, expect, it } from "vitest";
import {
  type PillarResult,
  SIGNALS,
  type SignalContext,
  Sky,
  type SpotForecast,
  type StepScore,
  bestUpcoming,
  findFlips,
  findWindows,
  scoreAt,
  tideView,
} from "../src/index.ts";
import { scorePillar } from "../src/pillars.ts";
import { HOUR, config, conditions, fixtureSpot, semidiurnalTide, withTide } from "./helpers.ts";

const FROM = "2026-11-01T00:00:00Z";
const T = Date.parse("2026-11-01T06:00:00Z");

function context(name: string, overrides: Partial<SignalContext> = {}): SignalContext {
  const { spot, tile } = fixtureSpot(name);
  const series = tile.tides.find((s) => s.id === spot.tideClusterId);
  return {
    spot,
    config,
    conditions: {},
    tide: series ? tideView(series) : undefined,
    sky: new Sky(spot.coordinate.lat, spot.coordinate.lon),
    t: T,
    ...overrides,
  };
}

describe("signals", () => {
  it("cover combines features as independent shelters, weighted by kind and distance", () => {
    const ctx = context("Fort Kochi Breakwater");
    const w = config.structure.kindWeights;
    const r = config.structure.radiusM;
    const expected =
      1 -
      (1 - w.breakwater! * (1 - 15 / r)) *
        (1 - w.rocks! * (1 - 40 / r)) *
        (1 - w.channelEdge! * (1 - 120 / r));
    const cover = SIGNALS.cover(ctx)!;
    expect(cover.value).toBeCloseTo(expected);
    expect(cover.detail).toMatchObject({ kind: "breakwater", distanceM: 15 });
  });

  it("a mangrove edge only shelters fish once the tide reaches it", () => {
    const tide = semidiurnalTide({
      id: "x",
      start: FROM,
      hours: 24,
      amplitudeCm: 50,
      lowAt: "2026-11-01T06:00:00Z",
    });
    const low = context("Vypin Mangrove Edge", {
      tide: tideView(tide),
      t: Date.parse("2026-11-01T06:00:00Z"),
    });
    const high = { ...low, t: Date.parse("2026-11-01T12:12:00Z") };
    const dry = SIGNALS.cover(low)!;
    expect(dry.detail).toMatchObject({ kind: "channelEdge", dryFeatures: 1 });
    expect(dry.value).toBeLessThan(0.45);
    const flooded = SIGNALS.cover(high)!;
    expect(flooded.detail).toMatchObject({ kind: "mangroveEdge" });
    expect(flooded.value).toBeGreaterThan(0.85);
  });

  it("tide movement peaks soon after a turn and is lowest at slack", () => {
    const tide = semidiurnalTide({
      id: "x",
      start: FROM,
      hours: 24,
      amplitudeCm: 50,
      lowAt: "2026-11-01T06:00:00Z",
    });
    const at = (iso: string) =>
      SIGNALS.tideMovement(
        context("Vypin Mangrove Edge", { tide: tideView(tide), t: Date.parse(iso) }),
      )!.value;
    expect(at("2026-11-01T06:10:00Z")).toBeLessThan(0.4);
    expect(at("2026-11-01T07:30:00Z")).toBe(1);
    expect(at("2026-11-01T12:05:00Z")).toBeLessThan(0.25);
  });

  it("absolute tidal flow is undefined without a tide and positive mid-flood", () => {
    expect(SIGNALS.tidalFlow(context("Periyar at Aluva Manalpuram"))).toBeUndefined();
    const tide = semidiurnalTide({
      id: "x",
      start: FROM,
      hours: 24,
      amplitudeCm: 50,
      lowAt: "2026-11-01T06:00:00Z",
    });
    const mid = SIGNALS.tidalFlow(
      context("Vypin Mangrove Edge", {
        tide: tideView(tide),
        t: Date.parse("2026-11-01T09:06:00Z"),
      }),
    )!;
    expect(mid.value).toBeGreaterThan(20); // A·2π/T ≈ 25 cm/h at mid-tide
    expect(mid.value).toBeLessThan(30);
  });

  it("habitat, water temperature, pressure and discharge read from facts and conditions", () => {
    const breakwater = context("Fort Kochi Breakwater", {
      conditions: conditions(
        { seaTempC: 27.6, pressureHpa: (t) => 1010 - (t - T) / HOUR },
        FROM,
        24,
      ),
    });
    expect(SIGNALS.nurseryHabitat(breakwater)).toMatchObject({
      value: 1,
      detail: { habitat: "riverMouth" },
    });
    expect(SIGNALS.waterTempAnomaly(breakwater)!.value).toBeCloseTo(
      27.6 - breakwater.spot.habitat.sstNormalC![10]!,
    );
    expect(SIGNALS.pressureTrend(breakwater)!.value).toBeCloseTo(-3);
    expect(SIGNALS.chlorophyll(breakwater)!.value).toBe(
      breakwater.spot.habitat.chlorophyllNormalMgM3![10],
    );

    const river = context("Periyar at Aluva Manalpuram", {
      conditions: conditions({ riverDischargeCumecs: 440 }, FROM, 24),
    });
    expect(SIGNALS.dischargeRatio(river)!.value).toBeCloseTo(2);
    expect(SIGNALS.waterDepth(river)).toBeUndefined();
  });

  it("low light is 1 at sunset, 0.3 at night and 0 at noon", () => {
    const at = (iso: string) =>
      SIGNALS.lowLightFeeding(context("Fort Kochi Breakwater", { t: Date.parse(iso) }))!.value;
    expect(at("2026-11-01T12:35:00Z")).toBe(1);
    expect(at("2026-11-01T19:00:00Z")).toBe(0.3);
    expect(at("2026-11-01T06:45:00Z")).toBe(0);
  });
});

describe("pillar scoring", () => {
  const scoring = (combine: "mean" | "geometric") => ({
    combine,
    threshold: 0.6,
    minCoverage: 0.5,
    signals: {
      windSpeed: { weight: 1, idealMin: 0, idealMax: 5, falloff: 5 },
      waveHeight: { weight: 1, idealMin: 0, idealMax: 1, falloff: 1 },
      currentSpeed: { weight: 2, idealMin: 0, idealMax: 1, falloff: 1 },
    },
  });
  const ctx = context("Fort Kochi Breakwater", {
    conditions: conditions({ windSpeedMs: 2.5, waveHeightM: 2 }, FROM, 24),
  });

  it("averages only the signals with data and reports coverage", () => {
    const result = scorePillar("comfort", scoring("mean"), ctx);
    expect(result.coverage).toBe(0.5);
    expect(result.score).toBeCloseTo(0.5); // wind 1, waves 0
    expect(result.status).toBe("missed");
    expect(result.reasons.map((r) => [r.signal, r.polarity])).toEqual([
      ["windSpeed", "positive"],
      ["waveHeight", "negative"],
    ]);
  });

  it("lets the weakest factor limit a geometric pillar", () => {
    const result = scorePillar("comfort", scoring("geometric"), ctx);
    expect(result.score).toBeCloseTo(Math.sqrt(0.05)); // floor applied to the zero
  });

  it("is unknown, and never earned, below minimum coverage", () => {
    const sparse = context("Fort Kochi Breakwater", {
      conditions: conditions({ windSpeedMs: 1 }, FROM, 24),
    });
    const result: PillarResult = scorePillar("comfort", scoring("mean"), sparse);
    expect(result.coverage).toBe(0.25);
    expect(result.status).toBe("unknown");
    expect(result.earned).toBe(false);
    expect(result.margin).toBeUndefined();
  });
});

describe("windows and flips", () => {
  const { spot } = fixtureSpot("Fort Kochi Breakwater");
  const template = scoreAt(spot, config, {}, undefined, new Sky(10, 76), T);
  const step = (
    minutes: number,
    rating: number,
    margin = 0.2,
    missing: "comfort" | "safety" | "food" = "safety",
  ): StepScore => {
    const pillars = structuredClone(template.pillars);
    for (const p of ["comfort", "safety", "food"] as const) {
      const earned = rating === 3 || (rating === 2 && p !== missing);
      pillars[p] = {
        ...pillars[p],
        earned,
        status: earned ? "earned" : "missed",
        margin: earned ? margin : -0.1,
      };
    }
    const t = T + minutes * 60_000;
    return {
      ...template,
      t,
      time: new Date(t).toISOString(),
      rating,
      label: rating === 3 ? "recommended" : rating === 2 ? "worthALook" : "low",
      pillars,
    };
  };
  const forecast = (ratings: number[], margin?: number): SpotForecast => ({
    spot,
    stepMinutes: 15,
    steps: ratings.map((r, i) => step(i * 15, r, margin)),
  });

  it("joins contiguous 3X steps and drops windows shorter than the minimum", () => {
    const windows = findWindows(forecast([3, 3, 3, 3, 3, 1, 3, 3, 1]), config);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.minutes).toBe(75);
    expect(windows[0]!.endTime).toBe(new Date(T + 75 * 60_000).toISOString().replace(".000Z", "Z"));
  });

  it("ranks longer, stronger windows first and scales by spot confidence", () => {
    const windows = findWindows(forecast([3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 3]), config);
    expect(windows.map((w) => w.minutes)).toEqual([90, 60]);
    expect(windows[0]!.score).toBeCloseTo((0.1 + 0.2) * (90 / 120) * spot.confidence);
  });

  it("maps a long-enough 2X stretch to the nearest 3X window on the same tide", () => {
    const flips = findFlips(forecast([2, 2, 2, 2, 2, 3, 3, 3, 3, 2, 1]), config);
    expect(flips).toHaveLength(1);
    expect(flips[0]!.missing).toBe("safety");
    expect(flips[0]!.window.minutes).toBe(60);
  });

  it("picks each spot's best window for the planner", () => {
    const good = forecast([3, 3, 3, 3, 3, 3], 0.4);
    const ok = forecast([3, 3, 3, 3, 1, 1]);
    const none = forecast([2, 2, 1, 1, 1, 1]);
    const picks = bestUpcoming([ok, none, good], config);
    expect(picks.map((p) => p.forecast)).toEqual([good, ok]);
  });
});

describe("step scores", () => {
  it("report the tide height and phase at each step", () => {
    const fixture = fixtureSpot("Vypin Mangrove Edge");
    const tide = semidiurnalTide({
      id: "tc-x",
      start: FROM,
      hours: 48,
      amplitudeCm: 50,
      lowAt: "2026-11-01T06:00:00Z",
    });
    const { spot, tile } = withTide(fixture.spot, fixture.tile, tide);
    const result = scoreAt(
      spot,
      config,
      {},
      tideView(tile.tides[0]!),
      new Sky(10, 76),
      "2026-11-01T06:00:00Z",
    );
    expect(result.tide).toMatchObject({ heightCm: -50, phase: "low" });
  });
});
