/**
 * Score real spots from a pipeline build with live Open-Meteo data and print the best times.
 *
 *   cd pipeline && uv run threex-compile build --region kochi --out build   (once)
 *   NODE_USE_ENV_PROXY=1 npm run demo -w @threex/core   (the env var only matters behind a proxy)
 *
 * A manual check of the engine on real data; not part of CI.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type Conditions,
  type Manifest,
  type ScoringConfig,
  type Spot,
  type Tile,
  Sky,
  findFlips,
  findWindows,
  floodUrl,
  forecastUrl,
  marineUrl,
  mergeConditions,
  parseFlood,
  parseForecast,
  parseMarine,
  scoreSpot,
} from "../src/index.ts";

const BUILD = fileURLToPath(new URL("../../../pipeline/build/v1/", import.meta.url));
const TIME_ZONE = "Asia/Kolkata";
const read = <T>(path: string): T => JSON.parse(readFileSync(BUILD + path, "utf8")) as T;

if (!existsSync(BUILD + "manifest.json")) {
  console.error(
    "No build found. Run: cd pipeline && uv run threex-compile build --region kochi --out build",
  );
  process.exit(1);
}

const manifest = read<Manifest>("manifest.json");
const config = read<ScoringConfig>(manifest.scoring.path);
const tiles = manifest.tiles.map((ref) => read<Tile>(ref.path));
const all = tiles.flatMap((tile) => tile.spots.map((spot) => ({ spot, tile })));

const pick = (test: (s: Spot) => boolean) => all.find(({ spot }) => test(spot));
const chosen = [
  pick((s) => s.waterType === "coastal" && s.features[0]?.kind === "breakwater"),
  pick((s) => s.waterType === "estuary" && s.features[0]?.kind === "mangroveEdge"),
  pick((s) => s.waterType === "freshwater" && s.river != null),
].filter((x) => x !== undefined);

const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const clock = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

async function getJson(url: string, attempts = 3): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} from ${url}`);
      return await response.json();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  }
}

async function conditionsFor(spot: Spot): Promise<Conditions> {
  const { lat, lon } = spot.coordinate;
  const parts = [parseForecast(await getJson(forecastUrl(lat, lon)))];
  if (spot.waterType === "freshwater") parts.push(parseFlood(await getJson(floodUrl(lat, lon))));
  else parts.push(parseMarine(await getJson(marineUrl(lat, lon))));
  return mergeConditions(...parts);
}

console.log(`Data ${manifest.dataVersion} · scoring ${config.version} · times in ${TIME_ZONE}\n`);
for (const { spot, tile } of chosen) {
  const conditions = await conditionsFor(spot);
  const forecast = scoreSpot(spot, tile, config, conditions, {
    sky: new Sky(spot.coordinate.lat, spot.coordinate.lon),
  });
  const counts = [0, 1, 2, 3].map((r) => forecast.steps.filter((s) => s.rating === r).length);
  console.log(`${spot.name} (${spot.waterType}, confidence ${spot.confidence})`);
  console.log(`  steps by rating 0/1/2/3 X: ${counts.join(" / ")}`);
  for (const w of findWindows(forecast, config).slice(0, 3)) {
    const span = `${fmt.format(w.start)}–${clock.format(w.end)}`;
    const tide = w.tidePhase ? `${w.tidePhase} tide` : "no tide";
    console.log(`  3X ${span}  ${tide}, ${w.light}, score ${w.score.toFixed(2)}`);
  }
  for (const f of findFlips(forecast, config).slice(0, 2)) {
    const when = `${clock.format(f.window.start)}–${clock.format(f.window.end)}`;
    console.log(
      `  2X ${fmt.format(f.start)}: gets ${f.missing} ${when} (${f.window.tidePhase ?? "—"} tide)`,
    );
  }
  console.log();
}
