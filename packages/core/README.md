# @threex/core

The 3X scoring engine and the data contract types. Pure TypeScript: no DOM, no network. The app fetches, and this package scores. The model is specified in [docs/3x-framework.md](../../docs/3x-framework.md).

```ts
import {
  Sky, bestUpcoming, findFlips, findWindows, forecastUrl, marineUrl,
  mergeConditions, parseForecast, parseMarine, scoreSpot,
} from "@threex/core";

const { lat, lon } = spot.coordinate; // spot coordinates, never the user's
const conditions = mergeConditions(
  parseForecast(await (await fetch(forecastUrl(lat, lon))).json()),
  parseMarine(await (await fetch(marineUrl(lat, lon))).json()),
);
const forecast = scoreSpot(spot, tile, config, conditions, { sky: new Sky(lat, lon) });
findWindows(forecast, config); // 3X windows, best first
findFlips(forecast, config);   // "Worth a look: gets Safety on the rising tide, 20:00–21:15"
```

| Script | |
|---|---|
| `npm test` | unit tests and golden scenarios (offline) |
| `npm run demo` | scores a real pipeline build (`pipeline/build`) with live Open-Meteo data. Behind a proxy, set `NODE_USE_ENV_PROXY=1` |
| `npm run gen:types` | regenerates `src/generated/contract.ts` from the JSON Schema |
