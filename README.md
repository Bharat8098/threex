# ThreeX

**Find the best fishing spots near you, and the best time to fish them.**

ThreeX doesn't rely on catch reports or word of mouth. It reads public data — tides, weather, water temperature, mapped structures and habitat — and scores every spot with the **3X framework**:

- **Comfort**: manageable flow, cool water, low light, oxygen.
- **Safety**: structure, weed lines and mangroves that hide fish from predators.
- **Food**: bait-holding habitat and a reason to feed.

A spot that earns all three X's is **Recommended**. A 2X spot can flip to 3X at the right tide, and ThreeX tells you when.

No accounts, no tracking, and your location never leaves your device. ThreeX ships as an installable web app for iPhone, iPad and everything else: in Safari, tap Share → Add to Home Screen.

> **Status:** M4, the screens. The Kochi pilot compiles 207 spots with 45-day tide predictions, and `@threex/core` scores them every 15 minutes against live weather. The installable web app shows spots near you on a map; each spot explains its rating in plain words, charts today's tide and the week ahead, and gives directions. A planner lists the best 3X windows for each day of the week. It keeps working offline. Launch region: India.

## Repository

| Path | What it is |
|---|---|
| [`docs/3x-framework.md`](docs/3x-framework.md) | the scoring model: source of truth |
| [`docs/data-sources.md`](docs/data-sources.md) | every dataset, licence and credit line |
| [`docs/pipeline.md`](docs/pipeline.md) | how open data becomes spots, facts and tide predictions |
| [`docs/design-system.md`](docs/design-system.md) | colour, type, glass and motion rules |
| [`docs/dev-workflow.md`](docs/dev-workflow.md) | how to build, test and set up services |
| `pipeline/` | Python data compiler, run weekly in CI, publishing static JSON |
| `config/regions/` | one file per region: area, OSM extract, tide gauges |
| `schema/v1/` | JSON Schema for the published data (generated) |
| `fixtures/v1/` | synthetic Kochi catalogue used by both test suites (generated) |
| `config/scoring-config.json` | 3X thresholds and weights, published with the data |
| `packages/core/` | `@threex/core`: contract types and the 3X scoring engine (pure TypeScript) |
| `apps/web/` | `@threex/web`: the installable PWA (Vite, React, MapLibre) |

## Quick start

```sh
cd pipeline && uv sync && uv run pytest && cd ..
npm ci && npm run typecheck && npm test
npm run dev -w @threex/web    # the app at http://127.0.0.1:5173
```

## Roadmap

1. **M0, foundations:** contract, docs, CI. ✅
2. **M1, pipeline v0:** Kochi pilot spots, EOT20 tides validated against the Cochin gauge. ✅
3. **M2, `@threex/core`:** the 3X scoring engine, tide-flip analysis and the window planner. ✅
4. **M3, app shell:** PWA, design system, map and offline cache. ✅
5. **M4, screens:** map, spot detail, best-times planner, about & data. ✅
6. **M5, expansion:** all of India.

## Licence

| What | Licence |
|---|---|
| Code (this repository) | [MIT](LICENSE) |
| Published spot catalogue (`threex-data`) | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), because it is derived from OpenStreetMap |
| Documentation (`docs/`) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Third-party datasets keep their own licences and credit lines; see [docs/data-sources.md](docs/data-sources.md). Published catalogues are derived from OpenStreetMap (© OpenStreetMap contributors) and other open datasets. ThreeX is not for navigation.
