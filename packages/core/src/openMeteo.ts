/**
 * Open-Meteo (CC BY 4.0) URL builders and response parsers. Pure functions: the app does the
 * fetching. Requests always use spot coordinates, never the user's own location.
 */
import type { Conditions, ConditionKey, Series } from "./conditions.ts";
import { HOUR, toMillis } from "./time.ts";

export interface OpenMeteoOptions {
  /** Days of forecast to request (Open-Meteo allows up to 16). */
  days?: number;
  /** Override hosts, e.g. Open-Meteo's commercial `customer-` hosts. */
  hosts?: Partial<Record<"forecast" | "marine" | "flood", string>>;
  /** Commercial API key, if any. */
  apiKey?: string;
}

const HOSTS = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  marine: "https://marine-api.open-meteo.com/v1/marine",
  flood: "https://flood-api.open-meteo.com/v1/flood",
} as const;

function url(
  api: keyof typeof HOSTS,
  lat: number,
  lon: number,
  params: Record<string, string>,
  options: OpenMeteoOptions,
): string {
  const query = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    timezone: "GMT",
    past_days: "1", // pressure trend needs the three hours before "now"
    forecast_days: String(options.days ?? 7),
    ...params,
  });
  if (options.apiKey) query.set("apikey", options.apiKey);
  return `${options.hosts?.[api] ?? HOSTS[api]}?${query}`;
}

export function forecastUrl(lat: number, lon: number, options: OpenMeteoOptions = {}): string {
  return url(
    "forecast",
    lat,
    lon,
    {
      hourly: "temperature_2m,cloud_cover,wind_speed_10m,surface_pressure",
      wind_speed_unit: "ms",
    },
    options,
  );
}

export function marineUrl(lat: number, lon: number, options: OpenMeteoOptions = {}): string {
  return url(
    "marine",
    lat,
    lon,
    { hourly: "sea_surface_temperature,wave_height,ocean_current_velocity" },
    options,
  );
}

export function floodUrl(lat: number, lon: number, options: OpenMeteoOptions = {}): string {
  return url("flood", lat, lon, { daily: "river_discharge" }, options);
}

interface Block {
  time: string[];
  [variable: string]: (number | null)[] | string[];
}
interface Response {
  hourly?: Block;
  hourly_units?: Record<string, string>;
  daily?: Block;
  daily_units?: Record<string, string>;
}

function block(
  json: unknown,
  key: "hourly" | "daily",
): { data: Block; units: Record<string, string> } {
  const response = json as Response;
  const data = response?.[key];
  if (!data || !Array.isArray(data.time)) {
    throw new Error(`Open-Meteo response has no ${key} block`);
  }
  return { data, units: (response[`${key}_units`] as Record<string, string>) ?? {} };
}

/** Open-Meteo times are GMT without a zone suffix when `timezone=GMT`. */
function gmt(time: string): number {
  return toMillis(time.length === 10 ? `${time}T00:00:00Z` : `${time}:00Z`);
}

function series(
  data: Block,
  variable: string,
  scale: (value: number) => number,
  kind: Series["kind"],
  span: number,
): Series | undefined {
  const raw = data[variable] as (number | null)[] | undefined;
  if (!raw) return undefined;
  return {
    times: data.time.map(gmt),
    values: raw.map((v) => (v == null ? null : scale(v))),
    kind,
    span,
  };
}

const KMH_TO_MS = 1 / 3.6;

function speedScale(unit: string | undefined): (v: number) => number {
  if (unit === "km/h") return (v) => v * KMH_TO_MS;
  if (unit === "kn") return (v) => v * 0.514444;
  if (unit === "mp/h") return (v) => v * 0.44704;
  return (v) => v; // m/s
}

function collect(entries: [ConditionKey, Series | undefined][]): Conditions {
  return Object.fromEntries(entries.filter(([, s]) => s !== undefined)) as Conditions;
}

export function parseForecast(json: unknown): Conditions {
  const { data, units } = block(json, "hourly");
  return collect([
    ["airTempC", series(data, "temperature_2m", (v) => v, "linear", HOUR)],
    ["cloudCover", series(data, "cloud_cover", (v) => v / 100, "linear", HOUR)],
    [
      "windSpeedMs",
      series(data, "wind_speed_10m", speedScale(units.wind_speed_10m), "linear", HOUR),
    ],
    ["pressureHpa", series(data, "surface_pressure", (v) => v, "linear", HOUR)],
  ]);
}

export function parseMarine(json: unknown): Conditions {
  const { data, units } = block(json, "hourly");
  return collect([
    ["seaTempC", series(data, "sea_surface_temperature", (v) => v, "linear", HOUR)],
    ["waveHeightM", series(data, "wave_height", (v) => v, "linear", HOUR)],
    [
      "currentSpeedMs",
      series(
        data,
        "ocean_current_velocity",
        speedScale(units.ocean_current_velocity),
        "linear",
        HOUR,
      ),
    ],
  ]);
}

export function parseFlood(json: unknown): Conditions {
  const { data } = block(json, "daily");
  return collect([
    ["riverDischargeCumecs", series(data, "river_discharge", (v) => v, "step", 24 * HOUR)],
  ]);
}
