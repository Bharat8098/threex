import {
  type Conditions,
  type Spot,
  floodUrl,
  forecastUrl,
  marineUrl,
  mergeConditions,
  parseFlood,
  parseForecast,
  parseMarine,
} from "@threex/core";

/** Weather varies little within ~5 km, so spots share one request per 0.05° cell. Requests
 * use cell centres derived from spot coordinates, never the user's location. */
const CELL_DEG = 0.05;

export function cellOf(spot: Spot): { key: string; lat: number; lon: number } {
  const lat = Math.round(spot.coordinate.lat / CELL_DEG) * CELL_DEG;
  const lon = Math.round(spot.coordinate.lon / CELL_DEG) * CELL_DEG;
  return { key: `${lat.toFixed(2)},${lon.toFixed(2)}`, lat, lon };
}

const PARALLEL = 4;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Open-Meteo: HTTP ${status}`);
    this.status = status;
  }
}

/** Retries network failures and server errors with backoff. A 4xx (including 429, rate
 * limited) is not retried: asking again straight away only makes it worse. */
async function getJson(url: string, attempts = 3): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new HttpError(response.status);
      return await response.json();
    } catch (error) {
      const clientError = error instanceof HttpError && error.status < 500;
      if (clientError || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
}

/** Run tasks with at most `limit` in flight: polite to a free API and to mobile networks. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await queue.shift()!();
    }),
  );
}

type Kind = "forecast" | "marine" | "flood";
const URLS = { forecast: forecastUrl, marine: marineUrl, flood: floodUrl };
const PARSERS = { forecast: parseForecast, marine: parseMarine, flood: parseFlood };

export interface SpotConditions {
  bySpot: Map<string, Conditions>;
  /** Spots missing at least one source after retries, so the app can say so and offer a retry. */
  incomplete: Set<string>;
}

/** Fetch every cell's conditions once and hand each spot its merged set. Failed requests
 * leave that data missing (the engine marks affected pillars unknown) rather than failing all. */
export async function conditionsFor(spots: Spot[]): Promise<SpotConditions> {
  const wanted = new Map<string, { kind: Kind; lat: number; lon: number }>();
  const plan = new Map<string, string[]>();
  for (const spot of spots) {
    const cell = cellOf(spot);
    const kinds: Kind[] = ["forecast", spot.waterType === "freshwater" ? "flood" : "marine"];
    plan.set(
      spot.id,
      kinds.map((kind) => {
        const key = `${kind}:${cell.key}`;
        wanted.set(key, { kind, lat: cell.lat, lon: cell.lon });
        return key;
      }),
    );
  }
  const fetched = new Map<string, Conditions>();
  await pool(
    [...wanted].map(([key, { kind, lat, lon }]) => async () => {
      try {
        fetched.set(key, PARSERS[kind](await getJson(URLS[kind](lat, lon))));
      } catch {
        // Leave it out: missing data is shown as unknown, not as zero.
      }
    }),
    PARALLEL,
  );
  const bySpot = new Map<string, Conditions>();
  const incomplete = new Set<string>();
  for (const [id, keys] of plan) {
    bySpot.set(id, mergeConditions(...keys.map((k) => fetched.get(k) ?? {})));
    if (keys.some((k) => !fetched.has(k))) incomplete.add(id);
  }
  return { bySpot, incomplete };
}
