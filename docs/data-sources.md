# Data sources

ThreeX uses only public data. This file lists every source, why it is used, its licence, and the credit the app must show. The machine-readable credit lines live in `pipeline/src/compiler/attributions.py` and are published in every manifest.

> India is the launch region. The pilot is **Kochi/Ernakulam**: it has coastal, estuary and freshwater spots, plus a tide gauge to validate predictions against.

## Compiled weekly by the pipeline

| Source | Used for | Licence | Credit shown | Access | Status |
|---|---|---|---|---|---|
| **OpenStreetMap** India extract (Geofabrik) | structures (piers, breakwaters, groynes, rocks, wrecks via `seamark:*`, bridges, weirs, dams), water bodies, roads/paths for access, exclusions | ODbL 1.0 | © OpenStreetMap contributors | `download.geofabrik.de` | ✅ |
| **FES2022** global tide model (AVISO) | 45-day tide predictions per tide cluster, computed with AVISO's `pyfes` | AVISO FES licence. AVISO states the *height* products may be used for any purpose, including commercial. FES currents are not distributed | The FES2022 Tide product was funded by CNES, produced by LEGOS, NOVELTIS and CLS and made freely available by AVISO | AVISO+ account; India subset stored as a private release asset, never committed | ✅ heights only |
| **UHSLC** tide gauges | validating predictions: RMSE and high/low timing error per cluster, which feed `confidence` | UHSLC data policy (citation requested) | in About & Data | `uhslc.soest.hawaii.edu` | ⚠️ Cochin confirmed; check Chennai and Visakhapatnam |
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

- **Physical features only from OSM.** Never use `leisure=fishing` or other catch/reporting tags. ThreeX does not rely on crowdsourced fishing reports.
- **Exclude** `landuse=military`, `access=no|private`, port operational areas and protected areas (`boundary=protected_area`). Marine sanctuaries also get a manual exclusion list.
- **ODbL share-alike.** The published catalogue is a database derived from OSM, so `threex-data` is published under **ODbL 1.0** with the OSM credit.
- **Map boundaries.** India requires official boundaries on published maps. Our map styles **hide administrative-boundary layers**, which don't matter at fishing zoom levels.
- **Not for navigation.** About & Data carries the disclaimer, plus angler-safety notes about waves, rocks and monsoon conditions.
- Large or licence-bound inputs (`*.osm.pbf`, `*.nc`, FES grids) are never committed. They live in `pipeline/.cache/` locally and in a private release asset for CI.

## Refresh cadence

| Layer | Cadence | Why |
|---|---|---|
| Tide predictions | weekly, 45 days ahead | `validUntil` stays at least 38 days out |
| Chlorophyll composite | weekly | follows blooms |
| OSM structures, mangroves, reefs, bathymetry | weekly (OSM) and on new releases (others) | slow-changing |
| SST normals | yearly | climatology |

## Network access in cloud sessions

The cloud environment must allow these hosts (Environment → Edit → Network access, keeping *Allow package managers* ticked):

```
download.geofabrik.de  coastwatch.pfeg.noaa.gov  uhslc.soest.hawaii.edu  download.gebco.net
zenodo.org  allencoralatlas.org  api.open-meteo.com  marine-api.open-meteo.com
flood-api.open-meteo.com  tiles.openfreemap.org
```
