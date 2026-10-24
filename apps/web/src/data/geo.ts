/** Geohash and distance helpers for picking catalogue tiles near a point. */

export interface Point {
  lat: number;
  lon: number;
}

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function geohash(lat: number, lon: number, precision: number): string {
  const latRange = [-90, 90];
  const lonRange = [-180, 180];
  let out = "";
  let bits = 0;
  let value = 0;
  let useLon = true;
  while (out.length < precision) {
    const range = useLon ? lonRange : latRange;
    const coord = useLon ? lon : lat;
    const mid = (range[0]! + range[1]!) / 2;
    if (coord >= mid) {
      value = (value << 1) | 1;
      range[0] = mid;
    } else {
      value <<= 1;
      range[1] = mid;
    }
    useLon = !useLon;
    if (++bits === 5) {
      out += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return out;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export function geohashBounds(hash: string): Bounds {
  const lat = [-90, 90];
  const lon = [-180, 180];
  let useLon = true;
  for (const char of hash) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`Invalid geohash ${hash}`);
    for (let shift = 4; shift >= 0; shift--) {
      const range = useLon ? lon : lat;
      const mid = (range[0]! + range[1]!) / 2;
      if ((value >> shift) & 1) range[0] = mid;
      else range[1] = mid;
      useLon = !useLon;
    }
  }
  return { south: lat[0]!, north: lat[1]!, west: lon[0]!, east: lon[1]! };
}

/** Great-circle distance in km. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

/** Distance from a point to the nearest edge of a box (0 inside it). */
export function distanceToBoundsKm(point: Point, bounds: Bounds): number {
  const lat = Math.min(Math.max(point.lat, bounds.south), bounds.north);
  const lon = Math.min(Math.max(point.lon, bounds.west), bounds.east);
  return distanceKm(point, { lat, lon });
}
