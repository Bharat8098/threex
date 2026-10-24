import { describe, expect, it } from "vitest";
import { tileOfSpot } from "../src/data/useSpots.ts";
import {
  HOUR_MS,
  bestOnDay,
  bestWindowsOnDay,
  days,
  directionsUrl,
  isApple,
  ratingRuns,
} from "../src/detail/model.ts";
import { parseRoute, routePath } from "../src/shell/route.ts";
import type { SpotScore, WindowLite } from "../src/workers/protocol.ts";

const QUARTER = 15 * 60_000;
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();

describe("ratingRuns", () => {
  it("merges equal neighbours", () => {
    expect(ratingRuns([3, 3, 2, 2, 2, 0], 0, QUARTER)).toEqual([
      { from: 0, to: 2 * QUARTER, rating: 3 },
      { from: 2 * QUARTER, to: 5 * QUARTER, rating: 2 },
      { from: 5 * QUARTER, to: 6 * QUARTER, rating: 0 },
    ]);
  });

  it("clips to a range", () => {
    expect(ratingRuns([3, 3, 2, 2], 0, QUARTER, QUARTER / 2, 3 * QUARTER)).toEqual([
      { from: QUARTER / 2, to: 2 * QUARTER, rating: 3 },
      { from: 2 * QUARTER, to: 3 * QUARTER, rating: 2 },
    ]);
  });
});

describe("days", () => {
  it("lists local midnights", () => {
    const list = days(at(24, 15), 3);
    expect(list).toEqual([at(24, 0), at(25, 0), at(26, 0)]);
  });
});

const win = (start: number, hours: number, score: number): WindowLite => ({
  start,
  end: start + hours * HOUR_MS,
  minutes: hours * 60,
  score,
  light: "dawn",
});
const score = (spotId: string, windows: WindowLite[], flips: WindowLite[] = []): SpotScore => ({
  spotId,
  now: {
    rating: 2,
    statuses: { comfort: "earned", safety: "earned", food: "missed" },
    light: "day",
  },
  windows: [...windows].sort((a, b) => b.score - a.score),
  flips: flips.map((w) => ({ start: w.start, end: w.end, missing: "food", window: w })),
});

describe("the week planner", () => {
  const scores = [
    score("a", [win(at(24, 6), 2, 0.4), win(at(24, 18), 2, 0.6), win(at(25, 6), 2, 0.5)]),
    score("b", [win(at(24, 17), 3, 0.7)]),
    score("c", [], [win(at(25, 20), 1, 0.2)]),
  ];

  it("takes each spot's best window of the day, best first", () => {
    const today = bestWindowsOnDay(scores, at(24, 0));
    expect(today.map((w) => [w.spotId, w.score])).toEqual([
      ["b", 0.7],
      ["a", 0.6],
    ]);
    expect(bestWindowsOnDay(scores, at(25, 0)).map((w) => w.spotId)).toEqual(["a"]);
  });

  it("colours the map by the best a spot reaches that day", () => {
    expect(bestOnDay(scores[0], at(24, 0))).toBe(3);
    expect(bestOnDay(scores[2], at(25, 0))).toBe(2);
    expect(bestOnDay(scores[2], at(24, 0))).toBe(1);
    expect(bestOnDay(undefined, at(24, 0))).toBeUndefined();
  });
});

describe("directions", () => {
  const point = { lat: 9.9667, lon: 76.2386 };

  it("opens Apple Maps on Apple devices and Google Maps elsewhere", () => {
    expect(directionsUrl(point, "Fort Kochi Breakwater", true)).toBe(
      "https://maps.apple.com/?daddr=9.966700,76.238600&q=Fort%20Kochi%20Breakwater",
    );
    expect(directionsUrl(point, "x", false)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=9.966700,76.238600",
    );
    expect(isApple("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe(true);
    expect(isApple("Mozilla/5.0 (Linux; Android 16)")).toBe(false);
  });
});

describe("routes", () => {
  it("round-trips spot and about paths", () => {
    expect(parseRoute("/spot/sp-t9y0wy7k")).toEqual({ name: "spot", id: "sp-t9y0wy7k" });
    expect(parseRoute("/about")).toEqual({ name: "about" });
    expect(parseRoute("/")).toEqual({ name: "list" });
    expect(parseRoute("/nonsense")).toEqual({ name: "list" });
    expect(routePath({ name: "spot", id: "sp-t9y0wy7k" })).toBe("/spot/sp-t9y0wy7k");
  });

  it("finds a shared spot's tile from its id", () => {
    expect(tileOfSpot("sp-t9y0wy7k")).toBe("t9y0");
    expect(tileOfSpot("not-a-spot")).toBeUndefined();
  });
});
