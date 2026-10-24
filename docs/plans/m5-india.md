# M5: all of India (work in progress)

Branch `m5-india`. Delete this file when M5 merges.

## Decisions (agreed)

- **3X is absolute, the app is exhaustive** (already merged in #9).
- **Choosing an area:**
  - The list follows the map: pan anywhere, then tap **Search this area** (like Apple Maps).
  - A search box finds towns and cities ("Goa", "Chilika") from a place index published with the data.
  - With location off, the app opens on an India overview showing where spots exist.
- **Rollout:** every state and union territory, including Andaman & Nicobar and Lakshadweep. Review and publish the coastal states first, then the inland states, all within M5.

## Findings so far

- **OSM:** per-state extracts exist at `https://download.openstreetmap.fr/extracts/asia/india/<state>-latest.osm.pbf`. The whole of India is a 2 GB file.
- **Tide gauges:** UHSLC has four usable Indian gauges:

  | Gauge | UHSLC id |
  |---|---|
  | Cochin | 174 |
  | Visakhapatnam | 157 |
  | Port Blair | 908 |
  | Minicoy | 153 |

  EOT20 predicts tides everywhere else, and these four validate it. INCOIS data needs registration, so it is out.
- **Kerala-wide build** (`config/regions/kerala.json`), with timings on a cloud container:

  | Stage | Elapsed |
  |---|---|
  | OSM clip, filter and export | 45 s |
  | EOT20 crop | 90 s |
  | ERDDAP fetches | about 50 s |
  | Map layers | started at 191 s |

  The run was stopped before the spot stages, so the spot count and total time are still unknown.

## Done on this branch (not yet checked against Kochi output)

- `Grid.nearest_valid` scans only the cells within reach. It used to scan the whole grid for every lookup.
- MUR sea-temperature requests sample every 5th cell (about 5 km, `SST_STRIDE`). A Kerala-wide request at full resolution would be about 600 MB.
- Quadratic loops are now spatially indexed:
  - edge-point thinning and spot clustering (`PointSet`);
  - habitat distances and bridge features (`layers.within`).
- `threex-compile build` prints elapsed seconds for each stage.

**Check before going further:** rebuild Kochi and diff `build/report/spots.geojson` against `main`. Only the sea-temperature normals should differ, because of the stride.

## Next steps

1. **National build:**
   - add `config/countries/india.json`: each state's id, name, extract slug, bbox and coastal flag, plus the four gauges;
   - build each state;
   - `threex-compile merge` combines the states into one catalogue: merge tiles by geohash and drop spots duplicated across state borders (within 150 m);
   - skip ETOPO, SST and chlorophyll fetches for inland states;
   - key GloFAS lookups by its 0.05° cell, and back off on HTTP 429.
2. **Place index:**
   - contents: cities, towns, spot localities, and named lakes, lagoons and reservoirs;
   - published as a hashed file referenced from the manifest;
   - this is a contract change: edit `models.py`, then regenerate the schema, fixtures and types.
3. **App:**
   - a search box over the place index;
   - **Search this area** after panning;
   - with location off, an India overview from the manifest's tile list;
   - the title shows the area being viewed;
   - remove the `regionCentre` fallback.
4. **Review:** build and look at every coastal state:
   - read the build report and render `spots.geojson` on a map;
   - check tides against the four gauges.

   Then do the same for the inland states.
5. **CI and docs:**
   - `compile-data` becomes a per-state matrix, then a merge job, then the deploy;
   - update the docs;
   - take screenshots, then open the PR.

## Running locally (macOS)

```sh
brew install osmium-tool uv node@22
cd pipeline && uv sync && uv run pytest
uv run threex-compile build --region kerala --out build-kerala   # whole-state measurement
```
