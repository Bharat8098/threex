/**
 * Hand-checked situations an experienced angler would agree with. Spots are the fixture's;
 * each scenario sets its own tide and weather. Kochi, 1 November 2026: sunrise ≈ 00:50 UTC
 * (06:20 IST), sunset ≈ 12:35 UTC (18:05 IST).
 */
import { describe, expect, it } from "vitest";
import { Sky, findFlips, findWindows, scoreAt, scoreSpot, spotTide } from "../src/index.ts";
import { config, conditions, fixtureSpot, semidiurnalTide, withTide } from "./helpers.ts";

const DAY = "2026-11-01T00:00:00Z";
const FROM = "2026-10-31T12:00:00Z";
const HOURS = 72;

// Low water 16:00 IST, high water 22:12 IST; a 1.2 m spring range, typical of Kochi.
const eveningTide = semidiurnalTide({
  id: "tc-evening",
  start: FROM,
  hours: HOURS,
  amplitudeCm: 60,
  lowAt: "2026-11-01T10:30:00Z",
});
// High water 13:00 IST: slack at the hottest, brightest time of day.
const middayTide = semidiurnalTide({
  id: "tc-midday",
  start: FROM,
  hours: HOURS,
  amplitudeCm: 60,
  lowAt: "2026-11-01T01:17:00Z",
});

const sst = (spotNormal: number, offset: number) => spotNormal + offset;
const falling = (t: number) => 1010 - (t - Date.parse(DAY)) / 3_600_000 / 6; // −0.5 hPa per 3 h
const steady = 1010;

function score(
  name: string,
  tide: typeof eveningTide | undefined,
  weather: ReturnType<typeof conditions>,
  at: string,
) {
  const fixture = fixtureSpot(name);
  const { spot, tile } = tide ? withTide(fixture.spot, fixture.tile, tide) : fixture;
  const sky = new Sky(spot.coordinate.lat, spot.coordinate.lon);
  return scoreAt(spot, config, weather, spotTide(spot, tile), sky, at);
}

const earned = (s: ReturnType<typeof score>) =>
  Object.fromEntries(Object.entries(s.pillars).map(([p, r]) => [p, r.status]));

describe("Fort Kochi Breakwater", () => {
  const normal = fixtureSpot("Fort Kochi Breakwater").spot.habitat.sstNormalC![10]!;

  it("is Recommended at dusk on a rising tide under cloud", () => {
    const weather = conditions(
      {
        cloudCover: 0.8,
        windSpeedMs: 4,
        waveHeightM: 0.6,
        currentSpeedMs: 0.2,
        seaTempC: sst(normal, -1),
        pressureHpa: falling,
      },
      FROM,
      HOURS,
    );
    const s = score("Fort Kochi Breakwater", eveningTide, weather, "2026-11-01T12:30:00Z");
    expect(earned(s)).toEqual({ comfort: "earned", safety: "earned", food: "earned" });
    expect(s.label).toBe("recommended");
    expect(s.light).toBe("dusk");
  });

  it("is at most 1X at slack water under a clear midday sun with warm water", () => {
    const weather = conditions(
      {
        cloudCover: 0,
        windSpeedMs: 0.5,
        waveHeightM: 0.3,
        currentSpeedMs: 0.05,
        seaTempC: sst(normal, 1),
        pressureHpa: steady,
      },
      FROM,
      HOURS,
    );
    const s = score("Fort Kochi Breakwater", middayTide, weather, "2026-11-01T07:30:00Z");
    expect(s.pillars.comfort.status).toBe("missed");
    expect(s.pillars.food.status).toBe("missed");
    expect(s.rating).toBeLessThanOrEqual(1);
    const light = s.pillars.comfort.reasons.find((r) => r.signal === "lightLevel");
    expect(light?.polarity).toBe("negative");
  });

  it("can't earn Comfort without weather data", () => {
    const s = score("Fort Kochi Breakwater", eveningTide, {}, "2026-11-01T12:30:00Z");
    expect(s.pillars.comfort.status).toBe("unknown");
    expect(s.pillars.comfort.earned).toBe(false);
  });
});

describe("Vypin Mangrove Edge", () => {
  const normal = fixtureSpot("Vypin Mangrove Edge").spot.habitat.sstNormalC![10]!;
  const weather = conditions(
    {
      cloudCover: 0.5,
      windSpeedMs: 3,
      waveHeightM: 0.3,
      currentSpeedMs: 0.1,
      seaTempC: sst(normal, -0.5),
      pressureHpa: falling,
    },
    FROM,
    HOURS,
  );

  it("is Worth a look at dusk while the mangroves are still dry", () => {
    const s = score("Vypin Mangrove Edge", eveningTide, weather, "2026-11-01T12:30:00Z");
    expect(s.tide!.heightCm).toBeLessThan(20); // below the edge's minTideCm
    expect(earned(s)).toEqual({ comfort: "earned", safety: "missed", food: "earned" });
    expect(s.label).toBe("worthALook");
    const veg = s.pillars.safety.signals.find((r) => r.signal === "cover")!;
    expect(veg.detail?.dryFeatures).toBe(1);
  });

  it("flips to Recommended once the rising tide floods the mangroves", () => {
    const s = score("Vypin Mangrove Edge", eveningTide, weather, "2026-11-01T14:45:00Z");
    expect(s.tide!.heightCm).toBeGreaterThanOrEqual(20);
    expect(s.label).toBe("recommended");

    const fixture = fixtureSpot("Vypin Mangrove Edge");
    const { spot, tile } = withTide(fixture.spot, fixture.tile, eveningTide);
    const forecast = scoreSpot(spot, tile, config, weather, {
      from: "2026-11-01T09:00:00Z",
      hours: 9,
    });
    // Dusk: Safety arrives with the flood. Then high-water slack: Food returns with the ebb.
    const flips = findFlips(forecast, config);
    expect(flips.map((f) => f.missing)).toEqual(["safety", "food"]);
    const window = flips[0]!.window;
    expect(window.start).toBeGreaterThanOrEqual(Date.parse("2026-11-01T14:00:00Z"));
    expect(window.start).toBeLessThanOrEqual(Date.parse("2026-11-01T15:00:00Z"));
    expect(window.minutes).toBeGreaterThanOrEqual(config.planner.minWindowMinutes);
    expect(window.tidePhase).toBe("rising");
    expect(findWindows(forecast, config)).toContainEqual(window);
  });

  // Open-Meteo Marine answers a backwater spot from the nearest sea cell, so its current is
  // the offshore current, not the backwater's. Estuary Comfort reads flow from the tide.
  it("keeps the same Comfort at dusk when the offshore current runs strong", () => {
    const at = "2026-11-01T12:30:00Z";
    const strong = { ...weather, ...conditions({ currentSpeedMs: 1.5 }, FROM, HOURS) };
    const calm = score("Vypin Mangrove Edge", eveningTide, weather, at);
    const s = score("Vypin Mangrove Edge", eveningTide, strong, at);
    expect(s.pillars.comfort.score).toBe(calm.pillars.comfort.score);
    expect(s.pillars.comfort.status).toBe("earned");
  });

  it("can't earn Comfort without weather data", () => {
    const s = score("Vypin Mangrove Edge", eveningTide, {}, "2026-11-01T12:30:00Z");
    expect(s.pillars.comfort.status).toBe("unknown");
    expect(s.pillars.comfort.earned).toBe(false);
  });
});

describe("Periyar at Aluva Manalpuram (freshwater)", () => {
  const median = fixtureSpot("Periyar at Aluva Manalpuram").spot.river!.dischargeMedianCumecs;
  const weather = (dischargeRatio: number) =>
    conditions(
      {
        cloudCover: 0.4,
        windSpeedMs: 2,
        riverDischargeCumecs: median * dischargeRatio,
        pressureHpa: falling,
      },
      FROM,
      HOURS,
    );

  it("is Recommended at dusk on a normal river", () => {
    const s = score("Periyar at Aluva Manalpuram", undefined, weather(1), "2026-11-01T12:30:00Z");
    expect(earned(s)).toEqual({ comfort: "earned", safety: "earned", food: "earned" });
    expect(s.tide).toBeUndefined();
  });

  it("loses Comfort when the river runs at three times its median", () => {
    const s = score("Periyar at Aluva Manalpuram", undefined, weather(3), "2026-11-01T12:30:00Z");
    expect(s.pillars.comfort.status).toBe("missed");
    expect(
      s.pillars.comfort.reasons.some(
        (r) => r.signal === "dischargeRatio" && r.polarity === "negative",
      ),
    ).toBe(true);
  });
});
