import { describe, expect, it } from "vitest";
import { distanceKm, distanceToBoundsKm, geohash, geohashBounds } from "../src/data/geo.ts";

describe("geohash", () => {
  it("matches the reference encoding", () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(geohash(9.9667, 76.2386, 4)).toBe("t9y0");
  });

  it("decodes to a box that holds the point", () => {
    const box = geohashBounds(geohash(10.1076, 76.3516, 5));
    expect(box.south).toBeLessThanOrEqual(10.1076);
    expect(box.north).toBeGreaterThan(10.1076);
    expect(box.west).toBeLessThanOrEqual(76.3516);
    expect(box.east).toBeGreaterThan(76.3516);
  });

  it("rejects characters outside the alphabet", () => {
    expect(() => geohashBounds("t9a")).toThrow("Invalid geohash");
  });
});

describe("distances", () => {
  it("measures great-circle distance", () => {
    expect(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.2, 1);
    expect(distanceKm({ lat: 9.9667, lon: 76.2386 }, { lat: 9.9667, lon: 76.2386 })).toBe(0);
  });

  it("is zero inside a box and grows outside it", () => {
    const box = geohashBounds("t9y0");
    expect(distanceToBoundsKm({ lat: 9.9667, lon: 76.2386 }, box)).toBe(0);
    const outside = distanceToBoundsKm(
      { lat: box.north + 0.1, lon: (box.west + box.east) / 2 },
      box,
    );
    expect(outside).toBeCloseTo(11.1, 1);
  });
});
