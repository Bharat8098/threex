import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Sky,
  floodUrl,
  forecastUrl,
  marineUrl,
  membership,
  parseFlood,
  parseForecast,
  parseMarine,
  tideAt,
  tideRate,
  tideStage,
  tideView,
  valueAt,
} from "../src/index.ts";
import { HOUR, MINUTE, fixtureSpot } from "./helpers.ts";

const sample = (name: string) =>
  JSON.parse(readFileSync(new URL(`./data/open-meteo-${name}.json`, import.meta.url), "utf8"));

describe("band membership", () => {
  const band = { weight: 1, idealMin: 2, idealMax: 4, falloff: 2 };
  it("is 1 inside the ideal range and falls linearly outside", () => {
    expect(membership(3, band)).toBe(1);
    expect(membership(2, band)).toBe(1);
    expect(membership(1, band)).toBeCloseTo(0.5);
    expect(membership(5.5, band)).toBeCloseTo(0.25);
    expect(membership(10, band)).toBe(0);
  });
  it("is a hard yes/no with zero falloff", () => {
    expect(membership(4.01, { ...band, falloff: 0 })).toBe(0);
  });
});

describe("tide view", () => {
  const { tile } = fixtureSpot("Fort Kochi Breakwater");
  const series = tile.tides[0]!;
  const view = tideView(series);
  const start = Date.parse(series.start);

  it("passes through the hourly heights and is undefined outside the series", () => {
    for (const i of [0, 5, 30])
      expect(tideAt(view, start + i * HOUR)).toBeCloseTo(series.heightsCm[i]!);
    expect(tideAt(view, start - MINUTE)).toBeUndefined();
    expect(tideAt(view, start + (series.heightsCm.length - 1) * HOUR + MINUTE)).toBeUndefined();
  });

  it("rises before high water and falls after it", () => {
    const high = series.events.find((e) => e.kind === "high")!;
    const t = Date.parse(high.time);
    expect(tideRate(view, t - HOUR)!).toBeGreaterThan(0);
    expect(tideRate(view, t + HOUR)!).toBeLessThan(0);
    expect(tideStage(view, t + 20 * MINUTE)!.phase).toBe("high");
    expect(tideStage(view, t + 2 * HOUR)!.phase).toBe("falling");
    expect(tideStage(view, t + 2 * HOUR)!.minutesSinceTurn).toBeCloseTo(120);
  });
});

describe("sky", () => {
  const sky = new Sky(9.97, 76.24); // Fort Kochi
  const day = Date.parse("2026-11-01T00:00:00Z");

  it("puts sunrise near 06:20 IST and the sun high at noon", () => {
    const sunrise = sky.events(day, day + 24 * HOUR).find((e) => e.kind === "sunrise")!;
    const ist = new Date(sunrise.t + 5.5 * HOUR);
    expect(ist.getUTCHours() * 60 + ist.getUTCMinutes()).toBeGreaterThan(6 * 60 + 5);
    expect(ist.getUTCHours() * 60 + ist.getUTCMinutes()).toBeLessThan(6 * 60 + 35);
    expect(sky.sunAltitude(day + 6.75 * HOUR)).toBeGreaterThan(60);
    expect(sky.sunAltitude(day - 6 * HOUR)).toBeLessThan(-30);
  });

  it("finds moon transits about 24 h 50 min apart", () => {
    const transits = sky.events(day, day + 6 * 24 * HOUR).filter((e) => e.kind === "moonTransit");
    expect(transits.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < transits.length; i++) {
      const gap = (transits[i]!.t - transits[i - 1]!.t) / MINUTE;
      expect(gap).toBeGreaterThan(24 * 60 + 20);
      expect(gap).toBeLessThan(25 * 60 + 20);
    }
  });
});

describe("Open-Meteo", () => {
  it("builds requests in fixed units and GMT, with an optional key", () => {
    const url = new URL(forecastUrl(9.97384, 76.24467, { days: 3, apiKey: "k" }));
    expect(url.searchParams.get("latitude")).toBe("9.9738");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("apikey")).toBe("k");
    expect(marineUrl(10, 76)).toContain("ocean_current_velocity");
    expect(floodUrl(10, 76, { hosts: { flood: "https://example.org/flood" } })).toMatch(
      /^https:\/\/example\.org\/flood\?/,
    );
  });

  it("parses forecasts into fixed units", () => {
    const json = sample("forecast");
    const c = parseForecast(json);
    const t = Date.parse(`${json.hourly.time[3]}:00Z`);
    expect(valueAt(c, "windSpeedMs", t)).toBe(json.hourly.wind_speed_10m[3]);
    expect(valueAt(c, "cloudCover", t)).toBeCloseTo(json.hourly.cloud_cover[3] / 100);
    expect(valueAt(c, "pressureHpa", t + 30 * MINUTE)).toBeCloseTo(
      (json.hourly.surface_pressure[3] + json.hourly.surface_pressure[4]) / 2,
    );
  });

  it("converts marine currents from km/h to m/s", () => {
    const json = sample("marine");
    const t = Date.parse(`${json.hourly.time[0]}:00Z`);
    expect(valueAt(parseMarine(json), "currentSpeedMs", t)).toBeCloseTo(
      json.hourly.ocean_current_velocity[0] / 3.6,
    );
  });

  it("holds daily river discharge across the day and stops after it", () => {
    const json = sample("flood");
    const c = parseFlood(json);
    const day = Date.parse(`${json.daily.time[0]}T00:00:00Z`);
    expect(valueAt(c, "riverDischargeCumecs", day + 15 * HOUR)).toBe(json.daily.river_discharge[0]);
    const last = Date.parse(`${json.daily.time.at(-1)}T00:00:00Z`);
    expect(valueAt(c, "riverDischargeCumecs", last + 25 * HOUR)).toBeUndefined();
  });

  it("treats gaps as missing, never as zero", () => {
    const json = sample("forecast");
    json.hourly.wind_speed_10m[2] = null;
    const c = parseForecast(json);
    const t = Date.parse(`${json.hourly.time[2]}:00Z`);
    expect(valueAt(c, "windSpeedMs", t)).toBeUndefined();
    expect(valueAt(c, "windSpeedMs", t - 30 * MINUTE)).toBeUndefined();
  });

  it("rejects responses without data", () => {
    expect(() => parseForecast({ error: true, reason: "x" })).toThrow(/no hourly block/);
  });
});
