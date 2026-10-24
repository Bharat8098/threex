# The data pipeline

`pipeline/` compiles open data into the static catalogue the app downloads. It publishes **facts** about spots; all 3X scoring happens in `@threex/core` (see [3x-framework.md](3x-framework.md)). Sources and licences are listed in [data-sources.md](data-sources.md).

```sh
cd pipeline
uv run threex-compile fetch --region kochi             # download or reuse inputs
uv run threex-compile build --region kochi --out build  # fetch + compile + report
uv run threex-compile validate build                    # re-check a published catalogue
```

`build` needs `osmium-tool`; the cloud SessionStart hook and CI install it. Inputs are cached in `pipeline/.cache/` (or `$THREEX_CACHE`). A warm Kochi build takes about 20 seconds.

## Regions

`config/regions/<name>.json` defines a region. Adding a region is mostly a new file. It holds:

| Field | Meaning |
|---|---|
| `bbox` | `[min lon, min lat, max lon, max lat]` |
| `osmExtractUrl` | the smallest OSM extract that covers the region |
| `gauges` | UHSLC gauges to validate tides against |
| `tidalRiverMaxInlandKm` | rivers and canals farther than this from the open sea count as freshwater |
| `stationRadiusKm` | how close a spot must be to a gauge to use its harmonics, when they win |

## Stages

### 1. Layers (`spots/layers.py`)

OSM elements are sorted into layers, projected to metres around the region centre:
- structures;
- vegetation (OSM mangroves, reed beds and marsh, plus Global Mangrove Watch polygons);
- water;
- coastline;
- access (public roads and paths);
- bridges;
- exclusion zones;
- places.

An **open-sea mask** comes from ETOPO: cells deeper than 1 m that connect to the edge of the grid. Harbours and backwaters are too shallow and narrow for the grid, so they fall outside it, which is exactly what separates coastal from estuary.

Kerala maps its backwaters as `water=lake`, so lakes of 5 km² or more, and anything named *kayal*, backwater or lagoon, are treated as **lagoons**.

### 2. Candidates (`spots/candidates.py`)

| Step | Rule |
|---|---|
| Anchors | the **tip** of each structure (the end farthest from roads: a breakwater's head, a pier's end); the midpoint of weirs and dams; where a bridge spans 60 m or more of river, lagoon, lake or reservoir (not canals); river mouths; points every 300 m along mangrove and reed edges within 40 m of water, thinned to 600 m (mangroves) and 800 m (reeds) |
| Exclusions | within 30 m of military land, a port, a shipyard, a protected area, a nature reserve or an airport (for structures, any part counts); or a name marking a restricted facility |
| Access | walkable structures (piers, jetties, breakwaters, groynes) must touch a public road or path within 30 m; everything else must be within 300 m of one |
| Water type | **coastal** within 1 km of open sea. Otherwise **estuary** if the nearby water is a lagoon or is tagged tidal or salt. Otherwise **freshwater** if it is all lake or reservoir. Otherwise **estuary** within `tidalRiverMaxInlandKm` of open sea, and **freshwater** beyond it |
| Clustering | strongest anchor wins within 150 m: structures, then bridges, weirs and rocks, then mouths, then vegetation edges |
| Names | the OSM name (English or Latin script only; placeholders such as "Need Name" are ignored; the kind is appended if the name lacks one, as in "Fort Kochi Pier"). Otherwise "Mangrove edge 0.9 km SW of Bolgatty", using the nearest place. `locality` is the nearest town or suburb |

### 3. Facts (`spots/facts.py`)

| Fact | How |
|---|---|
| `features` | the nearest feature of each kind within 200 m. Mangrove edges get `minTideCm: 0`, because they flood from about mean sea level. A `dropOff` is added where the ETOPO slope reaches 2 m per 100 m |
| `depthM`, `depthSlope` | the nearest ETOPO sea cell within 500 m. Empty when there is none (most harbour and backwater spots) |
| `habitat` | distances to mangroves (within 10 km), reefs (10 km), reed beds (5 km) and river mouths (20 km). Monthly SST normals (within 15 km) and chlorophyll normals (within 10 km), for tidal spots only |
| `river` | the GloFAS median discharge, for freshwater spots on a river or canal |
| `confidence` | starts at 0.85 (coastal), 0.7 (estuary) or 0.65 (freshwater). It loses 0.1 for missing depth, missing SST (tidal spots) or missing discharge (freshwater), and 0.15 for having no features |

### 4. Tides (`tides/predict.py`)

1. **Score each gauge.** Find the latest two-year window that is at least 70% complete, and hold out its final 120 days. Fit UTide harmonics on the rest, and score both the harmonics and EOT20 on the held-out days. The scores are RMSE after removing the observed mean, and mean high/low timing error over gap-free stretches.
2. **Choose a method for each tidal spot.** If the nearest gauge's harmonics won and the spot is within `stationRadiusKm`, use the gauge's harmonics (series id `tc-<gauge>`). Otherwise use EOT20 at the spot's 1/8° model cell (series id `tc-<geohash5 of the cell>`).
3. **Predict.** Each series is predicted hourly for 45 days from 00:00 UTC on the build day, relative to MSL. High and low waters are refined with a parabola and rounded to the minute.
4. **Confidence.** 0.8 when the winning RMSE is at most 10 cm, 0.7 at most 15 cm, 0.55 otherwise, and 0.5 with no gauge within 50 km. Estuary clusters lose 0.15.

### 5. Publish (`publish/layout.py`)

`v1/manifest.json` plus content-hashed `v1/tiles/<geohash4>.<hash>.json` and `v1/scoring/<hash>.json`, re-validated after writing. `report/build-report.md` and `report/spots.geojson` are written alongside for review.

## Kochi pilot: first build (October 2026)

**207 spots** in 7 tiles:
- 29 coastal, 141 estuary, 37 freshwater;
- 16 tide series, all EOT20 (it beat the gauge's harmonics; see [data-sources.md](data-sources.md#tide-model-choice)).

Anchors dropped:

| Reason | Count |
|---|---|
| No public access | 49 |
| Inside military or port areas | 11 |
| Restricted facility | 3 |
| Merged into a nearby spot | 56 |

## Automation

`.github/workflows/compile-data.yml` runs every Monday at 01:17 UTC, and on demand with a region input.
- It caches the slow-changing inputs, builds and validates, and uploads the catalogue as an artifact.
- Once `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets exist, it also deploys to the `threex-data` Cloudflare Pages project, with `pipeline/publish/_headers` providing CORS and caching rules.

## Known limits

- **Backwater tides.** Lag and damping in estuaries aren't modelled. Estuary series carry lower confidence until a backwater gauge or a better model is available.
- **Depth.** ETOPO's ~450 m grid can't see harbours, backwaters or rivers.
- **Water type.** Tidal reach is estimated from distance to the open sea; OSM `tidal=yes` and `salt=yes` tags override it when present.
- **Map coverage.** OSM coverage decides which structures exist. A pier that isn't mapped isn't a spot.
