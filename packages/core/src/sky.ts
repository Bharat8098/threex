/** Sun and moon timing from suncalc (BSD-2-Clause), cached per location. */
import SunCalc from "suncalc";
import { HOUR, MINUTE } from "./time.ts";

export type SkyEventKind =
  "sunrise" | "sunset" | "moonrise" | "moonset" | "moonTransit" | "moonUnderfoot";

export interface SkyEvent {
  t: number;
  kind: SkyEventKind;
}

const DAY = 24 * HOUR;
const MOON_SAMPLE = 10 * MINUTE;
const RAD = 180 / Math.PI;

function valid(date: Date | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/** Sun altitude and sun/moon events for one place. Spots a few km apart can share one. */
export class Sky {
  private covered: [number, number] | undefined;
  private list: SkyEvent[] = [];

  readonly lat: number;
  readonly lon: number;

  constructor(lat: number, lon: number) {
    this.lat = lat;
    this.lon = lon;
  }

  /** Sun altitude above the horizon in degrees. */
  sunAltitude(t: number): number {
    return SunCalc.getPosition(new Date(t), this.lat, this.lon).altitude * RAD;
  }

  /** All sun and moon events between `from` and `to`, in time order. */
  events(from: number, to: number): SkyEvent[] {
    if (!this.covered || from < this.covered[0] || to > this.covered[1]) {
      const start = Math.min(from, this.covered?.[0] ?? from) - DAY;
      const end = Math.max(to, this.covered?.[1] ?? to) + DAY;
      this.list = this.compute(start, end);
      this.covered = [start + DAY, end - DAY];
    }
    return this.list.filter((e) => e.t >= from && e.t <= to);
  }

  /** The event of one of `kinds` nearest to t, and how many minutes away it is. */
  nearest(
    t: number,
    kinds: readonly SkyEventKind[],
  ): { event: SkyEvent; minutes: number } | undefined {
    let best: { event: SkyEvent; minutes: number } | undefined;
    for (const event of this.events(t - DAY, t + DAY)) {
      if (!kinds.includes(event.kind)) continue;
      const minutes = Math.abs(event.t - t) / MINUTE;
      if (!best || minutes < best.minutes) best = { event, minutes };
    }
    return best;
  }

  private compute(start: number, end: number): SkyEvent[] {
    const events: SkyEvent[] = [];
    const add = (date: Date | undefined, kind: SkyEventKind) => {
      if (valid(date) && date.getTime() >= start && date.getTime() <= end) {
        events.push({ t: date.getTime(), kind });
      }
    };
    const solarNoonOffset = 12 * HOUR - (this.lon / 15) * HOUR;
    for (let day = Math.floor(start / DAY) * DAY; day <= end; day += DAY) {
      const sun = SunCalc.getTimes(new Date(day + solarNoonOffset), this.lat, this.lon);
      add(sun.sunrise, "sunrise");
      add(sun.sunset, "sunset");
      const moon = SunCalc.getMoonTimes(new Date(day), this.lat, this.lon, true);
      add(moon.rise, "moonrise");
      add(moon.set, "moonset");
    }
    // Moon transits: extremes of the moon's altitude, refined with a parabola.
    const altitude = (t: number) =>
      SunCalc.getMoonPosition(new Date(t), this.lat, this.lon).altitude;
    let a0 = altitude(start - MOON_SAMPLE);
    let a1 = altitude(start);
    for (let t = start; t <= end; t += MOON_SAMPLE) {
      const a2 = altitude(t + MOON_SAMPLE);
      if ((a1 > a0 && a1 >= a2) || (a1 < a0 && a1 <= a2)) {
        const curvature = a0 - 2 * a1 + a2;
        const offset = curvature ? (0.5 * (a0 - a2)) / curvature : 0;
        events.push({
          t: t + offset * MOON_SAMPLE,
          kind: a1 > a0 ? "moonTransit" : "moonUnderfoot",
        });
      }
      a0 = a1;
      a1 = a2;
    }
    const unique = new Map<string, SkyEvent>();
    for (const e of events) unique.set(`${e.kind}:${Math.round(e.t / MINUTE)}`, e);
    return [...unique.values()].sort((a, b) => a.t - b.t);
  }
}
