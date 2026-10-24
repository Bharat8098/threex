import type { WaterType } from "@threex/core";

const time = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });

function dayLabel(t: number, now: number): string {
  const day = (ms: number) => new Date(ms).toDateString();
  if (day(t) === day(now)) return "Today";
  if (day(t) === day(now + 86_400_000)) return "Tomorrow";
  return weekday.format(t);
}

/** "Today 18:00–20:15", "Tue 06:30–08:30", in the device's own time zone. */
export function formatWindow(start: number, end: number, now = Date.now()): string {
  return `${dayLabel(start, now)} ${time.format(start)}–${time.format(end)}`;
}

export const WATER: Record<WaterType, string> = {
  coastal: "Coastal",
  estuary: "Estuary",
  freshwater: "Freshwater",
};

/** "420 m", "3.9 km", "18 km"; the non-breaking space keeps number and unit together. */
export function formatDistance(km: number): string {
  return km < 1
    ? `${Math.round(km * 1000)}\u00a0m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)}\u00a0km`;
}
