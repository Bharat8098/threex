# Data sources

ThreeX is open source and uses only open data. This file lists every source, why it is used, its licence, and the credit the app must show.

**Rule:** every input must be openly licensed and downloadable without an account, so anyone can clone the repo and rebuild the catalogue. The machine-readable credit lines live in `pipeline/src/compiler/attributions.py` and are published in every manifest.

> India is the launch region. The pilot is **Kochi/Ernakulam**: it has coastal, estuary and freshwater spots, plus a tide gauge to validate predictions against. How the pipeline turns these sources into spots is in [pipeline.md](pipeline.md).

## Compiled weekly by the pipeline

| Source | Used for | Licence | Credit shown | Access |
|---|---|---|---|---|
| **OpenStreetMap**, state extracts from the OSM France mirror (Kerala for the pilot) | structures (piers, jetties, breakwaters, groynes, rocks, wrecks, weirs, dams), bridges, water bodies, mangroves and reed beds, roads and paths for access, exclusion zones, place names | ODbL 1.0 | © OpenStreetMap contributors | `download.openstreetmap.fr`, then clipped and filtered with `osmium-tool` |
| **EOT20** global ocean tide model (DGFI-TUM) | 45-day tide predictions, computed with [`pyTMD`](https://github.com/tsutterley/pyTMD) (MIT) | CC BY 4.0 | Tides: EOT20, Hart-Davis et al. (2021), DGFI-TUM (CC BY 4.0) | SEANOE, [doi:10.17882/79489](https://doi.org/10.17882/79489). Only the 1.2 GB `ocean_tides` member of the archive is read, and it is cropped to the region (about 400 KB) |
| **UHSLC** fast-delivery tide gauges | scoring EOT20 and gauge harmonics on held-out data; gauge harmonics (fitted with [`UTide`](https://github.com/wesleybowman/UTide), MIT) where they win | UHSLC data policy (free, citation requested) | Tide validation: University of Hawaii Sea Level Center | `uhslc.soest.hawaii.edu`. India: Cochin (174), Visakhapatnam (157), Minicoy (153), Port Blair (908). There is no Chennai gauge |
| **ETOPO 2022** 15″ relief (NOAA NCEI) | depth, drop-offs, and the open-sea mask that separates coastal from estuary | Public domain (U.S. Government) | Depth: NOAA NCEI ETOPO 2022 | ERDDAP subset (`ETOPO_2022_v1_15s`). Harbours and backwaters read as land at this resolution, so those spots have no depth rather than a wrong one |
| **MUR SST** monthly (NASA JPL) | monthly sea-temperature normals (2016–2025) | Public domain | via the CoastWatch credit | ERDDAP `jplMURSST41mday` |
| **MODIS Aqua chlorophyll-a** monthly (NASA) | monthly productivity normals (2012–2021, geometric mean) | Public domain | via the CoastWatch credit | ERDDAP `erdMH1chlamday`. Normals beat a recent composite here: monsoon cloud blanks weekly composites over Kerala from June to September |
| **Global Mangrove Watch** v4.0.19, 2020, 10 m | mangrove edges (Safety) and nurseries (Food) | CC BY 4.0 | Mangrove extent: Global Mangrove Watch (CC BY 4.0) | `zenodo.org` (180 MB GeoTIFF archive, cached) |
| **GloFAS** river discharge (Copernicus EMS) via Open-Meteo | each freshwater spot's median flow (2015–2024), the baseline for `dischargeRatio` | CC BY 4.0 | River flow: Copernicus GloFAS via Open-Meteo (CC BY 4.0) | `flood-api.open-meteo.com`, cached per spot |
| **Allen Coral Atlas** | reefs (Lakshadweep, Andamans, Gulf of Mannar) | believed CC BY 4.0 | Reef habitat: Allen Coral Atlas | not used yet: there are no reefs in the Kochi pilot. ⚠️ Confirm the licence before first use |

## Fetched live by the app

| Source | Used for | Licence | Notes |
|---|---|---|---|
| **Open-Meteo Forecast** | wind, cloud cover, surface pressure, air temperature, sunrise/sunset | CC BY 4.0 | **The free tier is non-commercial only** (under 10,000 calls a day). A free app with no ads fits. If ThreeX is ever monetised, switch to Open-Meteo's paid API key; the base URL and key are config values |
| **Open-Meteo Marine** | sea-surface temperature, waves, ocean currents | CC BY 4.0 | marine cells only: an inland request is answered from the nearest sea cell (a point in Kochi's backwaters gets values from just off the coast) |
| **Open-Meteo Flood** (GloFAS) | river discharge for freshwater spots | CC BY 4.0 | daily resolution |
| **OpenFreeMap** | basemap vector tiles | OSM-based (ODbL) | no key; attribution shown on the map |

Requests use **spot** coordinates (public) and never the user's own location, which stays on the device.

## Rules

- **Licences.** ThreeX's code is MIT, the published catalogue is ODbL 1.0, and the docs are CC BY 4.0 (see the README). Every source above must allow that.
- **Physical features only from OSM.** `leisure=fishing` and other catch or reporting tags are dropped as they are read. ThreeX does not rely on crowdsourced fishing reports.
- **Exclusions:**
  - military land, ports and shipyards, protected areas, nature reserves and airports (any structure touching one, within 30 m);
  - roads and paths tagged `access=private|no`;
  - structures whose names mark them as restricted (navy, coast guard, oil, bunker, cargo, container, mooring, embarkation, dry dock, shipyard);
  - private ponds and aquaculture.

  Marine sanctuaries will also get a manual exclusion list.
- **ODbL share-alike.** The published catalogue is a database derived from OSM, so `threex-data` is published under **ODbL 1.0** with the OSM credit.
- **Map boundaries.** India requires official boundaries on published maps. Our map styles **hide administrative-boundary layers**, which don't matter at fishing zoom levels.
- **Not for navigation.** About & Data carries the disclaimer, plus angler-safety notes about waves, rocks and monsoon conditions.
- **Large inputs** (`*.osm.pbf`, `*.nc`, tide-model grids) are never committed. The pipeline downloads them into `pipeline/.cache/` (or `$THREEX_CACHE`), and CI caches the slow-changing ones.

## Refresh cadence

| Layer | Cadence | Why |
|---|---|---|
| Tide predictions | weekly, 45 days ahead | `validUntil` stays at least 38 days out |
| OSM (structures, access, exclusions) and tide-gauge records | weekly | maps and gauges change |
| Gauge harmonics and the method choice | weekly, from the latest two-year window that is at least 70% complete | gauges go quiet for months; constants barely drift |
| SST and chlorophyll normals, mangroves, bathymetry, river medians | cached; refreshed when the CI cache key changes | climatologies and slow-changing layers |

## Tide model choice

| Model | Licence | Why / why not |
|---|---|---|
| **EOT20** ✅ | CC BY 4.0, open download | Open and redistributable. Its coastal accuracy is on a par with FES2014, and close to FES2022 for the major constituents. Supported by pyTMD |
| UHSLC gauge harmonics ✅ | free data; the fitted constants are ours | Used near a gauge *if they score better than EOT20* on held-out data |
| FES2022 | AVISO licence, account required, grids not redistributable | Not used: contributors couldn't rebuild the data without an AVISO account |
| TPXO | free for academic use, commercial licence required | Not used: not open |

**Kochi result** (first build, October 2026). Both methods were scored on the same held-out 120 days of the Cochin gauge (May–September 2024, monsoon):
- **EOT20:** 8.2 cm RMSE, 36 min mean high/low timing error.
- **Gauge harmonics:** 10.6 cm RMSE, 32 min.

So Kochi uses EOT20. Every tide series carries the winning method's numbers in `validation`. Estuary clusters lose 0.15 confidence, because backwater lag and damping aren't modelled yet.

## Network access in cloud sessions

The cloud environment must allow these hosts (Environment → Edit → Network access → Custom, keeping *Also include default list of common package managers* ticked):

```
download.openstreetmap.fr  coastwatch.pfeg.noaa.gov  uhslc.soest.hawaii.edu  www.seanoe.org
zenodo.org  allencoralatlas.org  api.open-meteo.com  marine-api.open-meteo.com
flood-api.open-meteo.com  tiles.openfreemap.org
```

`download.geofabrik.de` and `overpass-api.de` accept the connection from Claude cloud sessions but never respond, so the pipeline uses the OSM France mirror. GitHub Actions can use either.
