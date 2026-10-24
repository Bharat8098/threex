import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTile, regionCentre, spotsNear, tilesNear } from "../src/data/catalogue.ts";
import { manifest, readFixture, tiles } from "./fixtures.ts";

const fortKochi = { lat: 9.9667, lon: 76.2386 };

describe("picking tiles and spots", () => {
  it("opens the map in the middle of the region's tiles", () => {
    const centre = regionCentre(manifest);
    expect(centre.lat).toBeGreaterThan(9.8);
    expect(centre.lat).toBeLessThan(10.3);
    expect(centre.lon).toBeGreaterThan(76.1);
    expect(centre.lon).toBeLessThan(76.6);
  });

  it("keeps only tiles within the radius", () => {
    expect(tilesNear(manifest, fortKochi, 1).map((t) => t.geohash)).toEqual(["t9y0"]);
    expect(tilesNear(manifest, fortKochi, 25).map((t) => t.geohash)).toEqual(["t9y0", "t9y3"]);
    expect(tilesNear(manifest, { lat: 28.6, lon: 77.2 }, 25)).toEqual([]);
  });

  it("lists spots nearest first and drops those beyond the radius", () => {
    const near = spotsNear(tiles, fortKochi, 25);
    expect(near.map((n) => n.spot.name)).toEqual([
      "Fort Kochi Breakwater",
      "Vypin Mangrove Edge",
      "Periyar at Aluva Manalpuram",
    ]);
    expect(near[0]!.distanceKm).toBe(0);
    expect(near[2]!.tile.geohash).toBe("t9y3");
    expect(spotsNear(tiles, fortKochi, 5)).toHaveLength(2);
  });
});

describe("loading tiles", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ref = manifest.tiles[0]!;

  it("accepts a tile whose bytes match the manifest hash", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array(readFixture(ref.path))));
    vi.stubGlobal("fetch", fetch);
    const tile = await loadTile(ref);
    expect(tile.geohash).toBe(ref.geohash);
    expect(fetch).toHaveBeenCalledWith(`/data/v1/${ref.path}`);
  });

  it("rejects a tampered tile", async () => {
    const tampered = readFixture(ref.path).toString("utf8").replace("Fort Kochi", "Fort Kochl");
    vi.stubGlobal("fetch", async () => new Response(tampered));
    await expect(loadTile(ref)).rejects.toThrow("hash check");
  });

  it("reports HTTP errors", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    await expect(loadTile(ref)).rejects.toThrow("HTTP 404");
  });
});
