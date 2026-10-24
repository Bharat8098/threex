# Data sources

ThreeX is open source and uses only open data. This file lists every source, why it is used, its licence, and the credit the app must show.

**Rule:** every input must be openly licensed and downloadable without an account, so anyone can clone the repo and rebuild the catalogue. The machine-readable credit lines live in `pipeline/src/compiler/attributions.py` and are published in every manifest.

> India is the launch region. The pilot is **Kochi/Ernakulam**: it has coastal, estuary and freshwater spots, plus a tide gauge to validate predictions against.

## Compiled weekly by the pipeline

| Source | Used for | Licence | Credit shown | Access | Status |
|---|---|---|---|---|---|
| **OpenStreetMap** India extract (Geofabrik) | structures (piers, breakwaters, groynes, rocks, wrecks via `seamark:*`, bridges, weirs, dams), water bodies, roads/paths for access, exclusions | ODbL 1.0 | © OpenStreetMap contributors | `download.geofabrik.de` | ✅ |
| **EOT20** global ocean tide model (DGFI-TUM) | 45-day tide predictions per tide cluster, computed with [`pyTMD`](https://github.com/tsutterley/pyTMD) (MIT) | CC BY 4.0 | Tides: EOT20, Hart-Davis et al. (2021), DGFI-TUM (CC BY 4.0) | open download from SEANOE, [doi:10.17882/79489](https://doi.org/10.17882/79489); no account | ✅ 17 constituents, 1/8° grid |
| **UHSLC** tide gauges | (1) validating EOT20: RMSE and high/low timing error per cluster, which feed `confidence`; (2) station harmonics for spots near a gauge, fitted with [`UTide`](https://github.com/wesleybowman/UTide) (MIT) | UHSLC data policy (free, citation requested) | Tide validation: University of Hawaii Sea Level Center | `uhslc.soest.hawaii.edu` | ⚠️ Cochin confirmed; check Chennai and Visakhapatnam |
| **GEBCO** grid | depth and drop-off hints | GEBCO terms of use | Bathymetry: GEBCO Compilation Group, GEBCO Grid | `download.gebco.net` | ✅ about 450 m grid, coarse near shore |
| **Global Mangrove Watch** | mangrove edges (Safety) and nurseries (Food) | CC BY 4.0 | Mangrove extent: Global Mangrove Watch (CC BY 4.0) | `zenodo.org` | ✅ |
| **Allen Coral Atlas** | reefs (Lakshadweep, Andamans, Gulf of Mannar) | believed CC BY 4.0 | Reef habitat: Allen Coral Atlas | `allencoralatlas.org` | ⚠️ confirm licence before first use |
| **NOAA CoastWatch ERDDAP** | monthly SST normals; recent chlorophyll-a composite | Public domain (U.S. Government) | in About & Data | `coastwatch.pfeg.noaa.gov` | ✅ |

## Fetched live by the app

| Source | Used for | Licence | Notes |
|---|---|---|---|
| **Open-Meteo Forecast** | wind, cloud cover, surface pressure, air temperature, sunrise/sunset | CC BY 4.0 | **The free tier is non-commercial only** (under 10,000 calls a day). A free app with no ads fits. If ThreeX is ever monetised, switch to Open-Meteo's paid API key; the base URL and key are config values |
| **Open-Meteo Marine** | sea-surface temperature, waves, ocean currents | CC BY 4.0 | marine cells near the coast only; inland points return nothing |
| **Open-Meteo Flood** (GloFAS) | river discharge for freshwater spots | CC BY 4.0 | daily resolution |
| **OpenFreeMap** | basemap vector tiles | OSM-based (ODbL) | no key; attribution shown on the map |

Requests use **spot** coordinates (public) and never the user's own location, which stays on the device.

## Rules

- **Licences.** ThreeX's code is MIT, the published catalogue is ODbL 1.0, and the docs are CC BY 4.0 (see the README). Every source below must allow that.
- **Physical features only from OSM.** Never use `leisure=fishing` or other catch/reporting tags. ThreeX does not rely on crowdsourced fishing reports.
- **Exclude** `landuse=military`, `access=no|private`, port operational areas and protected areas (`boundary=protected_area`). Marine sanctuaries also get a manual exclusion list.
- **ODbL share-alike.** The published catalogue is a database derived from OSM, so `threex-data` is published under **ODbL 1.0** with the OSM credit.
- **Map boundaries.** India requires official boundaries on published maps. Our map styles **hide administrative-boundary layers**, which don't matter at fishing zoom levels.
- **Not for navigation.** About & Data carries the disclaimer, plus angler-safety notes about waves, rocks and monsoon conditions.
- Large inputs (`*.osm.pbf`, `*.nc`, tide-model grids) are never committed. The pipeline downloads them into `pipeline/.cache/`, and CI caches them between runs.

## Refresh cadence

| Layer | Cadence | Why |
|---|---|---|
| Tide predictions | weekly, 45 days ahead | `validUntil` stays at least 38 days out |
| Station harmonics (UHSLC) | yearly | refit on a year or more of recent hourly data |
| Chlorophyll composite | weekly | follows blooms |
| OSM structures, mangroves, reefs, bathymetry | weekly (OSM) and on new releases (others) | slow-changing |
| SST normals | yearly | climatology |

## Tide model choice

| Model | Licence | Why / why not |
|---|---|---|
| **EOT20** ✅ | CC BY 4.0, open download | Open and redistributable. Its coastal accuracy is on a par with FES2014, and close to FES2022 for the major constituents. Supported by pyTMD |
| UHSLC station harmonics ✅ | free data; the fitted constants are ours | Most accurate near a gauge. Used within the gauge's cluster, with EOT20 everywhere else |
| FES2022 | AVISO licence, account required, grids not redistributable | Not used: contributors couldn't rebuild the data without an AVISO account |
| TPXO | free for academic use, commercial licence required | Not used: not open |

The pipeline reports each cluster's error against the nearest gauge in `validation`. If EOT20 proves weak somewhere (for example inside the Kochi backwaters), that cluster's `confidence` drops. Station harmonics take over where a gauge is close.

## Network access in cloud sessions

The cloud environment must allow these hosts (Environment → Edit → Network access, keeping *Allow package managers* ticked):

```
download.geofabrik.de  coastwatch.pfeg.noaa.gov  uhslc.soest.hawaii.edu  www.seanoe.org  download.gebco.net
zenodo.org  allencoralatlas.org  api.open-meteo.com  marine-api.open-meteo.com
flood-api.open-meteo.com  tiles.openfreemap.org
```
