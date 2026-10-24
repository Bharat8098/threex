import { afterEach, describe, expect, it, vi } from "vitest";
import { cellOf, conditionsFor } from "../src/data/conditions.ts";
import { spot, spots } from "./fixtures.ts";

/** A minimal Open-Meteo response for whichever API the URL names. */
function reply(url: string): Response {
  const time = ["2026-11-01T00:00", "2026-11-01T01:00"];
  if (url.includes("flood"))
    return Response.json({ daily: { time: ["2026-11-01"], river_discharge: [120] } });
  if (url.includes("marine"))
    return Response.json({
      hourly: {
        time,
        sea_surface_temperature: [29, 29.2],
        wave_height: [0.8, 0.9],
        ocean_current_velocity: [1.8, 3.6],
      },
    });
  return Response.json({
    hourly: {
      time,
      temperature_2m: [27, 27.5],
      cloud_cover: [50, 60],
      wind_speed_10m: [3, 4],
      surface_pressure: [1010, 1009.5],
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("weather cells", () => {
  it("groups weather by 0.1° and river flow by 0.05°", () => {
    expect(cellOf(spot("Fort Kochi"), "forecast").key).toBe("10.00,76.20");
    expect(cellOf(spot("Vypin"), "marine").key).toBe("10.00,76.20");
    expect(cellOf(spot("Periyar"), "forecast").key).toBe("10.10,76.40");
    expect(cellOf(spot("Periyar"), "flood").key).toBe("10.10,76.35");
  });
});

describe("conditionsFor", () => {
  it("asks once per cell and source, using spot cells rather than the user's position", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return reply(url);
    });
    const { bySpot, incomplete } = await conditionsFor([...spots, spot("Fort Kochi")]);

    // Fort Kochi and Vypin share a 0.1° cell; Periyar has its own, and a river-flow cell.
    expect(urls.filter((u) => u.includes("api.open-meteo.com/v1/forecast"))).toHaveLength(2);
    expect(urls.filter((u) => u.includes("marine"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("flood"))).toHaveLength(1);
    const cells = new Set(
      urls
        .map((u) => new URL(u).searchParams)
        .map((q) => `${q.get("latitude")},${q.get("longitude")}`),
    );
    expect([...cells].sort()).toEqual(["10.0000,76.2000", "10.1000,76.3500", "10.1000,76.4000"]);

    expect(incomplete.size).toBe(0);
    expect(bySpot.get(spot("Fort Kochi").id)?.waveHeightM).toBeDefined();
    expect(bySpot.get(spot("Periyar").id)?.riverDischargeCumecs).toBeDefined();
    expect(bySpot.get(spot("Periyar").id)?.waveHeightM).toBeUndefined();
  });

  it("retries, then leaves failed sources missing and reports the spots affected", async () => {
    vi.useFakeTimers();
    let marineCalls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (!url.includes("marine")) return reply(url);
      marineCalls++;
      throw new TypeError("Failed to fetch");
    });
    const pending = conditionsFor(spots);
    await vi.runAllTimersAsync();
    const { bySpot, incomplete } = await pending;

    expect(marineCalls).toBe(1 * 3); // one cell, three attempts
    expect([...incomplete].sort()).toEqual([spot("Fort Kochi").id, spot("Vypin").id].sort());
    const fortKochi = bySpot.get(spot("Fort Kochi").id)!;
    expect(fortKochi.waveHeightM).toBeUndefined();
    expect(fortKochi.windSpeedMs).toBeDefined();
  });

  it("doesn't retry when rate limited", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      if (!url.startsWith("https://api.open-meteo.com/v1/forecast")) return reply(url);
      calls++;
      return new Response("", { status: 429 });
    });
    const { incomplete } = await conditionsFor(spots);
    expect(calls).toBe(2); // one per cell, no retries
    expect(incomplete.size).toBe(3);
  });
});
