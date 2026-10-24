import type { Band, Reason } from "@threex/core";
import { describe, expect, it } from "vitest";
import { describeReason, pillarSummary } from "../src/copy/reasons.ts";

const reason = (r: Partial<Reason> & Pick<Reason, "signal">): Reason => ({
  polarity: "positive",
  value: 0,
  membership: 1,
  ...r,
});
const band = (idealMin: number, idealMax: number): Band => ({
  weight: 1,
  idealMin,
  idealMax,
  falloff: 1,
});

describe("describeReason", () => {
  it("names the shelter and its distance", () => {
    const cover = reason({ signal: "cover", detail: { kind: "breakwater", distanceM: 15 } });
    expect(describeReason(cover)).toBe("Breakwater 15 m away");
  });

  it("says when mangroves haven't flooded yet", () => {
    const dry = reason({ signal: "cover", polarity: "negative", detail: { dryFeatures: 1 } });
    expect(describeReason(dry)).toBe("Mangroves still dry");
  });

  it("uses the band to tell too little from too much", () => {
    const wind = band(2, 9);
    expect(
      describeReason(reason({ signal: "windSpeed", polarity: "negative", value: 0.3 }), wind),
    ).toBe("Still air");
    expect(
      describeReason(reason({ signal: "windSpeed", polarity: "negative", value: 14 }), wind),
    ).toBe("Strong wind (50 km/h)");
    expect(describeReason(reason({ signal: "windSpeed", value: 4 }), wind)).toBe(
      "Light breeze (14 km/h)",
    );
  });

  it("describes water temperature against the usual", () => {
    expect(describeReason(reason({ signal: "waterTempAnomaly", value: -0.8 }))).toBe(
      "Water 0.8 °C cooler than usual",
    );
    expect(
      describeReason(
        reason({ signal: "waterTempAnomaly", polarity: "negative", value: 1.4 }),
        band(-3, 0.5),
      ),
    ).toBe("Water 1.4 °C warmer than usual");
  });

  it("reads light, tide and feeding times", () => {
    expect(
      describeReason(reason({ signal: "lightLevel", detail: { sunAltitude: 40, cloud: 0.9 } })),
    ).toBe("Overcast: low light");
    expect(describeReason(reason({ signal: "lightLevel", polarity: "negative" }))).toBe(
      "Bright sun",
    );
    expect(describeReason(reason({ signal: "tideMovement", detail: { phase: "falling" } }))).toBe(
      "Falling tide, water moving",
    );
    expect(
      describeReason(
        reason({ signal: "tideMovement", polarity: "negative", detail: { minutesSinceTurn: 10 } }),
      ),
    ).toBe("Slack water at the turn");
    expect(describeReason(reason({ signal: "lowLightFeeding", detail: { event: "sunset" } }))).toBe(
      "Dusk feeding time",
    );
    expect(describeReason(reason({ signal: "solunar", detail: { event: "moonrise" } }))).toBe(
      "Minor solunar period",
    );
  });

  it("reads river flow for freshwater spots", () => {
    const flow = band(0.5, 1.6);
    expect(
      describeReason(reason({ signal: "dischargeRatio", polarity: "negative", value: 3 }), flow),
    ).toBe("River running high (3.0× usual)");
    expect(
      describeReason(reason({ signal: "dischargeRatio", polarity: "negative", value: 0.1 }), flow),
    ).toBe("River running low");
  });
});

describe("pillarSummary", () => {
  const reasons: Reason[] = [
    reason({ signal: "cover", detail: { kind: "pier", distanceM: 40 } }),
    reason({ signal: "waterDepth", polarity: "negative", value: 0.4 }),
  ];
  const bands = () => band(1.5, 15);

  it("leads with what helped when the X is earned", () => {
    expect(pillarSummary({ status: "earned", reasons }, bands)).toEqual([
      "Pier 40 m away",
      "Shallow (0.4 m)",
    ]);
  });

  it("leads with what held it back when the X is missing", () => {
    expect(pillarSummary({ status: "missed", reasons }, bands, 1)).toEqual(["Shallow (0.4 m)"]);
  });

  it("says when there isn't enough data", () => {
    expect(pillarSummary({ status: "unknown", reasons: [] }, bands)).toEqual([
      "Not enough data to judge right now.",
    ]);
  });
});
