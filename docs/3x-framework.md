# The 3X framework

ThreeX recommends fishing spots from public data, not from catch reports. A fish settles where three needs are met at once:

| Pillar | The fish needs | Earns its X when… |
|---|---|---|
| **Comfort** | water it can hold in without fighting: manageable flow, cool water, low light, enough oxygen | conditions *right now* are easy to live in, with no single factor intolerable |
| **Safety** | somewhere to hide from bigger fish: structure, weed lines, mangroves, drop-offs | there is cover close by *and* the tide reaches it |
| **Food** | something to eat: bait-holding habitat plus a reason to feed | the habitat is productive *and* a feeding trigger is active |

**Rating = the number of X's a spot earns at a given moment** (every 15 minutes).

| Rating | Label | Shown as |
|---|---|---|
| 3X | **Recommended** | green badge, listed first |
| 2X | **Worth a look** | yellow badge, plus *which* X is missing and *when* it flips |
| 0–1X | — | muted |

Ratings change through the day as the tide, light and weather change. A spot is a place; a **window** is a stretch of time in which that place is 3X.

**The rating is absolute, and ThreeX is exhaustive.** Each pillar earns its X by clearing a fixed threshold, never by comparison with other spots. If thirty spots in an area are 3X at dawn, all thirty are shown as 3X: an angler wants to know every place that could fish well, not a shortlist. Thresholds are tuned against what fish need (the scenarios and real data below), never to make 3X rarer. Ranking only orders lists, and the app lists every spot within reach.

> **Status: v0.4** (scoring config `0.4.0`). The model is tuned against the golden scenarios in `packages/core/test/scenarios.test.ts` and checked against live Kochi data (see the *Tuning log* below). Thresholds and weights live in `config/scoring-config.json` and are published with the data, so the model can be retuned without shipping a new app.

---

## Where the work happens

```
pipeline (weekly)                    @threex/core (on the device, every 15 min for 7 days)
─────────────────                    ──────────────────────────────────────────────────
facts about each spot   ──tiles──▶   signals ──bands──▶ pillar scores ──threshold──▶ X's ──▶ rating
(structure, habitat,                 (from facts, the tide series,          windows · flips · reasons
 depth, predicted tides)              sun/moon and live Open-Meteo data)
```

- **The pipeline publishes facts only:** where a spot is, what is near it, how deep it is, and the predicted tide.
- **All scoring lives in `@threex/core`.** Nothing else may compute a score or rating, so the app, the tests and any future native port stay in agreement.

---

## Signals

Each signal produces a number in its own unit, or *no data* for that moment.

### Comfort

| Signal | Unit | How it is computed | Good when |
|---|---|---|---|
| `tidalFlow` | cm/h | absolute rate of tide change, from the tide series. Absolute rather than relative, so big-tide coasts (Gujarat) are penalised and Kerala's gentle tides are not | below about 30 cm/h |
| `currentSpeed` | m/s | Open-Meteo Marine ocean current (converted from km/h). **Coastal only:** Marine answers an inland point from the nearest sea cell, so at a backwater spot this would be the offshore current | gentle |
| `waterTempAnomaly` | °C | Open-Meteo Marine SST − the spot's normal for the month. At an estuary spot both come from the nearby coastal sea, so this is the regional sea anomaly, not the backwater's own temperature | at or below normal; cooler is better in Indian waters |
| `lightLevel` | 0–1 | 0 below −6° sun altitude; up to 0.1 at sunrise; then sin(altitude) ÷ sin 60° (capped at 1); all × (1 − 0.75 × cloud cover) | dim: dawn, dusk, overcast, night |
| `windSpeed` | m/s | Open-Meteo Forecast, 10 m wind | a breeze that aerates the water, not a gale |
| `waveHeight` | m | Open-Meteo Marine significant wave height | calm to moderate |
| `dischargeRatio` | ratio | Open-Meteo Flood discharge ÷ `river.dischargeMedianCumecs` | near normal flow (freshwater) |

### Safety

| Signal | Unit | How it is computed | Good when |
|---|---|---|---|
| `cover` | 0–1 | 1 − Π(1 − wᵢ·cᵢ) over every feature within `structure.radiusM`. Here wᵢ is `structure.kindWeights[kind]` and cᵢ = 1 − distance ÷ radius. A feature with a `minTideCm` (mangrove edges) only counts once the tide reaches it | strong shelter close by |
| `waterDepth` | m | `depthM` + tide height; no data where depth is unknown | deep enough, without being open water |

Structure and vegetation are **one** signal: they are alternative shelters, so a bridge or a mangrove edge alone can be enough.

### Food

| Signal | Unit | How it is computed | Good when |
|---|---|---|---|
| `nurseryHabitat` | 0–1 | the strongest of: mangroves (1 within 1 km, 0 at 10 km), weed beds (1 within 0.5 km, 0 at 5 km), reefs (1 within 1 km, 0 at 10 km), river mouths (1 within 2 km, 0 at 20 km) | nursery habitat close by |
| `chlorophyll` | mg/m³ | the spot's chlorophyll-a normal for the month (MODIS, via the pipeline) | productive water |
| `tideMovement` | 0–1 | rises from 0 to 1 over the first 30 min after a high or low; stays at 1 until 2.5 h; then falls linearly to 0 at the next turn | water clearly moving |
| `lowLightFeeding` | 0–1 | 1 within ±60 min of sunrise or sunset, falling to 0 by ±150 min; **0.3 at night** (sun below −6°), because many estuary fish feed after dark | dawn or dusk |
| `pressureTrend` | hPa / 3 h | pressure now − pressure 3 h ago (Open-Meteo asks for one past day, so this works from the first hour) | gently falling |
| `solunar` | 0–1 | 1 within ±60 min of a moon transit or anti-transit (major periods) or ±45 min of moonrise or moonset (minor periods); fading to 0 over the next 30 min | in a major or minor period |

Sun and moon times come from [suncalc](https://github.com/mourner/suncalc) (BSD-2-Clause). Moon transits are found from the moon's altitude.

### Water types

- **Freshwater** has no tide signals and uses `dischargeRatio`.
- **Estuaries** use neither `currentSpeed` nor `waveHeight`. Open-Meteo Marine has no cells in the backwaters and answers from the nearest sea cell, so both would describe the sea outside; `tidalFlow` carries the flow. Comfort's `minCoverage` is 0.65, so with no weather at all (only `tidalFlow` and `lightLevel`) Comfort stays unknown.
- **Estuaries** count any clearly moving tide toward Food (`tideMovement` ideal 0.4–1; coastal is 0.7–1). In estuaries the flooding itself lets fish into the mangroves, so a mangrove edge fishes late in the flood, not just early.

`config/scoring-config.json` is the authority. The pipeline rejects a config that gives a pillar a signal from another pillar.

---

## From signals to an X

1. **Band → membership (0–1).** Each signal has a *band* `{weight, idealMin, idealMax, falloff}`:

   ```
   membership
     1 ┤        ┌──────────────┐
       │       /                \
     0 ┼──────┘                  └──────
          idealMin−falloff  idealMin   idealMax  idealMax+falloff
   ```

   A `falloff` of 0 makes it a hard yes/no.

2. **Pillar score.** Memberships of the signals that have data are combined as the pillar's `combine` says:
   - **`geometric` (Comfort):** a weighted geometric mean, the convention of fisheries habitat-suitability indices. The weakest factor limits the pillar: bright midday sun can't be outvoted by calm water. Memberships are floored at 0.05 first, so one zero doesn't erase everything else.
   - **`mean` (Safety, Food):** a weighted arithmetic mean, where strengths can offset weaknesses.

3. **Coverage.** If the signals with data carry less than `minCoverage` of the pillar's total weight, the pillar is **unknown** for that moment. An unknown pillar never earns an X, and the UI says *why* rather than pretending. With no weather at all, Comfort is unknown.

4. **X.** The pillar earns its X when `score ≥ threshold`.

5. **Rating** = the number of X's:
   - `rating.recommendedMinX` (3) maps to *Recommended*;
   - `rating.worthALookMinX` (2) maps to *Worth a look*.

## Windows, flips and best times

- **Windows:** runs of 3X steps lasting at least `planner.minWindowMinutes` (60).
  - **Ranking:** score = (0.1 + mean margin) × min(1, minutes ÷ 120) × spot confidence. Margin is how far each pillar's score clears its threshold, averaged across the three pillars and over the window. Quality beats length, so a strong 2-hour dawn window outranks a marginal 5-hour night.
  - **Labels:** each window carries the tide phase and light at its peak.
- **Flips (2X → 3X):** for each 2X stretch at least as long as a window, the engine reports the pillar most often missing and the nearest 3X window on the same tide (within 6.2 h). For example: *"Worth a look — gets Safety on the rising tide, 20:00–21:15"*. Brief dips, such as a quarter hour of slack water between two windows, are not reported.
- **Best upcoming (`bestUpcoming`):** each spot's top window, best spots first. This is the "near me, next 7 days" list.

Tides are predicted for 45 days, so the same engine serves trip planning further ahead (with weather unknown, Comfort is unknown and only tide-led 2X windows show).

## Reasons

Every pillar result carries up to three positive and three negative **reasons**: signal, value, membership and detail. For example, `cover` with `{ kind: "breakwater", distanceM: 15 }`, or `{ dryFeatures: 1 }` when a mangrove edge hasn't flooded yet. Reasons are codes, not English; the app localises them ("Breakwater 15 m away", "Mangroves still dry").

## Confidence

- Every spot and tide series carries a `confidence` (0–1) from the pipeline.
- Confidence never changes a rating. It is shown alongside, and it scales window ranking.

## Engine API (`@threex/core`)

```ts
import { scoreSpot, findWindows, findFlips, bestUpcoming, forecastUrl, marineUrl, floodUrl,
         parseForecast, parseMarine, parseFlood, mergeConditions, Sky } from "@threex/core";

const conditions = mergeConditions(parseForecast(forecastJson), parseMarine(marineJson));
const forecast = scoreSpot(spot, tile, config, conditions, { sky }); // every 15 min, 7 days
findWindows(forecast, config); // 3X windows, best first
findFlips(forecast, config);   // 2X stretches and the 3X window they flip to
```

The core is pure: the app fetches, using the URL builders, which always use spot coordinates. `packages/core/scripts/demo.ts` runs the whole chain on a real pipeline build.

## Tuning log

| Version | Change | Why |
|---|---|---|
| 0.1.0 | first guesses | — |
| 0.2.0 | Comfort combines geometrically; `tidalFlow` becomes absolute cm/h; Food triggers weigh more than static habitat | bright, warm, slack middays were passing Comfort; relative flow penalised every mid-tide; Food passed on habitat alone |
| 0.3.0 | `structureCover` + `vegetationCover` merge into `cover`; Safety threshold 0.65; Food threshold 0.65; tighter coastal `tideMovement`; night feeding 0.3 | on live Kochi data, bridges and mangrove edges could never earn Safety, and the breakwater was 3X 78% of the week. It is now about 42% at a strong breakwater, 24% at a mangrove edge, and 11% at a bridge on a river in spate |
| 0.4.0 | estuary Comfort drops `currentSpeed`; estuary Comfort `minCoverage` 0.65 | Open-Meteo Marine has no backwater cells. All 141 Kochi estuary spots are answered by 7 coastal cells 1.1–19.2 km away (median 7.5 km), so `currentSpeed` was the offshore current. It stayed under 0.36 m/s through 2023–2025, so it scored a constant 1 that only lifted the geometric mean; `tidalFlow` already carries the backwater's flow. Separately, `tidalFlow` and `lightLevel` alone gave an estuary 54% coverage, so it could earn Comfort with no weather at all; at 0.65 it is unknown, as for the other water types. `waterTempAnomaly` stays: each spot's MUR baseline is within 0.09 °C of the normal at its Marine cell in every month, so it compares sea with sea. On live data for the week from 24 October, estuary 3X falls from 46.4% to 44.4% of steps: 47.7% → 47.4% where there is weather, and 27.4% → 0 where there is none. Coastal is unchanged |
