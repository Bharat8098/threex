# The 3X framework

ThreeX recommends fishing spots from public data, not from catch reports. A fish settles where three needs are met at once:

| Pillar | The fish needs | Earns its X when… |
|---|---|---|
| **Comfort** | water it can hold in without fighting: manageable flow, cool water, low light, enough oxygen | conditions *right now* are easy to live in |
| **Safety** | somewhere to hide from bigger fish: structure, weed lines, mangroves, drop-offs | there is cover nearby *and* enough water over it at this tide |
| **Food** | something to eat: bait-holding habitat plus a reason to feed | the habitat is productive *and* a feeding trigger is active |

**Rating = the number of X's a spot earns in a given hour.**

| Rating | Label | Shown as |
|---|---|---|
| 3X | **Recommended** | green badge, listed first |
| 2X | **Worth a look** | yellow badge, plus *which* X is missing and *when* it flips |
| 0–1X | — | muted |

Ratings change hour by hour as the tide, light and weather change. A spot is a place; a **window** is a stretch of time in which that place is 3X.

> **Status: v0.** The signals below are the starting model. Thresholds and weights live in `config/scoring-config.json` and will be tuned in M2 against hand-checked scenarios. They are published with the data, so the model can be tuned without shipping a new app.

---

## Where the work happens

```
pipeline (weekly)                    @threex/core (in the browser, hourly for 7 days)
─────────────────                    ─────────────────────────────────────────────
facts about each spot   ──tiles──▶   signals ──bands──▶ pillar scores ──threshold──▶ X's ──▶ rating
(structure, habitat,                 (from facts + live
 depth, predicted tides)              weather/marine data)
```

- **The pipeline publishes facts only:** where a spot is, what is near it, how deep it is, and the predicted tide.
- **All scoring lives in `@threex/core`.** Nothing else may compute a score or rating, so the app, the tests and any future native port stay in agreement.

---

## Signals

Every signal turns into a number in its own unit. The engine skips any signal without data for that hour; see *coverage* below.

### Comfort

| Signal | Unit | Computed from | Good when |
|---|---|---|---|
| `tidalFlow` | 0–1 | rate of tide change ÷ the series' maximum rate | moving, but not at peak flow |
| `currentSpeed` | m/s | Open-Meteo Marine ocean current | gentle current |
| `waterTempAnomaly` | °C | Open-Meteo Marine SST − the spot's monthly normal | at or below normal (cooler is better in Indian waters) |
| `lightLevel` | 0–1 | sun altitude × (1 − cloud cover) | dim: dawn, dusk, overcast, night |
| `windSpeed` | m/s | Open-Meteo Forecast, 10 m wind | a breeze that aerates the water, not a gale |
| `waveHeight` | m | Open-Meteo Marine significant wave height | calm to moderate |
| `dischargeRatio` | ratio | Open-Meteo Flood river discharge ÷ the spot's median | near normal flow (freshwater) |

### Safety

| Signal | Unit | Computed from | Good when |
|---|---|---|---|
| `structureCover` | 0–1 | non-vegetation features within `structure.radiusM`, weighted by `kindWeights` and distance, counting only features whose `minTideCm` is met at this hour | solid structure close by |
| `vegetationCover` | 0–1 | as above, for `mangroveEdge` and `weedBed` | flooded mangroves or weed lines close by |
| `waterDepth` | m | `depthM` + current tide height | deep enough to feel safe, without being open water |

### Food

| Signal | Unit | Computed from | Good when |
|---|---|---|---|
| `nurseryHabitat` | 0–1 | distance to mangroves, reef, weed beds and river mouths | nursery habitat close by |
| `chlorophyll` | mg/m³ | recent chlorophyll-a (ERDDAP), via the pipeline | productive water |
| `tideMovement` | 0–1 | 1 in the first two hours after a high or low, falling to 0 at the turn | tide just started moving |
| `lowLightFeeding` | 0–1 | 1 within the dawn and dusk windows, falling off either side | dawn or dusk |
| `pressureTrend` | hPa / 3 h | Open-Meteo Forecast surface pressure | gently falling |
| `solunar` | 0–1 | moon transit and moonrise/moonset periods (suncalc) | in a major or minor period |

Water types use different subsets of these signals:

- **Freshwater** has no tide-based signals and uses `dischargeRatio` instead.
- **Estuaries** weight `vegetationCover` and `nurseryHabitat` more heavily.

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

2. **Pillar score** = weighted mean of the memberships of the signals that have data.

3. **Coverage.** If the signals with data carry less than `minCoverage` of the pillar's total weight, the pillar is **unknown** for that hour. An unknown pillar never earns an X, and the UI says *why* ("no water-temperature data for this spot") rather than pretending.

4. **X.** The pillar earns its X when `score ≥ threshold`.

5. **Rating** = the number of X's.
   - `rating.recommendedMinX` (3) maps to *Recommended*.
   - `rating.worthALookMinX` (2) maps to *Worth a look*.

---

## Tide-flip analysis (2X → 3X)

Safety and Food often hinge on the tide. A mangrove edge only shelters fish once it floods, and feeding peaks when the water starts moving. For every 2X hour the engine asks: *within this tide cycle, is there an hour when the missing X is earned and the other two still hold?*

If so, the card reads, for example: **"Worth a look — gets Safety at high tide, 18:40–20:10"**.

Because tides are predicted for 45 days, this works for trip planning, not just for "now".

## Best-times planner

- The planner scans the next `planner.horizonHours` (168, i.e. 7 days) for every nearby spot.
- It keeps 3X windows lasting at least `planner.minWindowMinutes`.
- It ranks windows by duration × margin, where margin is how far each pillar is above its threshold.
- Each window is labelled with its tide stage (for example, "2 h after low, rising") and its light (dawn, dusk or night).

## Reasons

Every pillar result carries its strongest positive and negative signals as **reasons** (localisation keys plus values), so a spot can always explain itself. For example: *"Breakwater 15 m away"*, *"Tide turned 40 min ago"*, *"Water 1.2 °C cooler than usual"*. This is how a data-driven app earns an angler's trust.

## Confidence

- Every spot and tide series carries a `confidence` (0–1) from the pipeline. Estuary interiors and spots far from a validating tide gauge score lower.
- Confidence never changes a rating. It is shown alongside the rating, and the planner uses it to break ties.
