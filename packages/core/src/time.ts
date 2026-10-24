/** Times are epoch milliseconds (UTC) inside the engine and ISO strings at its edges. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function toMillis(time: Date | number | string): number {
  if (typeof time === "number") return time;
  if (time instanceof Date) return time.getTime();
  const millis = Date.parse(time);
  if (Number.isNaN(millis)) throw new Error(`Invalid time: ${time}`);
  return millis;
}

export function toIso(millis: number): string {
  return new Date(millis).toISOString().replace(".000Z", "Z");
}

/** The largest index i with sorted[i] <= value, or -1. */
export function floorIndex(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (sorted[mid]! <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}
