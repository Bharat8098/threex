# ThreeX

**Find the best fishing spots near you, and the best time to fish them.**

ThreeX doesn't rely on catch reports or word of mouth. It reads public data — tides, weather, water temperature, mapped structures and habitat — and scores every spot with the **3X framework**:

- **Comfort**: manageable flow, cool water, low light, oxygen.
- **Safety**: structure, weed lines and mangroves that hide fish from predators.
- **Food**: bait-holding habitat and a reason to feed.

A spot that earns all three X's is **Recommended**. A 2X spot can flip to 3X at the right tide, and ThreeX tells you when.

No accounts, no tracking, and your location never leaves your device. ThreeX ships as an installable web app for iPhone, iPad and everything else: in Safari, tap Share → Add to Home Screen.

> **Status:** M0, foundations. Launch region: India, with a Kochi pilot covering coastal, estuary and freshwater spots.

## Repository

| Path | What it is |
|---|---|
| [`docs/3x-framework.md`](docs/3x-framework.md) | the scoring model: source of truth |
| [`docs/data-sources.md`](docs/data-sources.md) | every dataset, licence and credit line |
| [`docs/design-system.md`](docs/design-system.md) | colour, type, glass and motion rules |
| [`docs/dev-workflow.md`](docs/dev-workflow.md) | how to build, test and set up services |
| `pipeline/` | Python data compiler, run weekly in CI, publishing static JSON |
| `schema/v1/` | JSON Schema for the published data (generated) |
| `fixtures/v1/` | synthetic Kochi catalogue used by both test suites (generated) |
| `config/scoring-config.json` | 3X thresholds and weights, published with the data |
| `packages/core/` | `@threex/core`: contract types and, from M2, the scoring engine |
| `apps/web/` | the PWA (from M3) |

## Quick start

```sh
cd pipeline && uv sync && uv run pytest && cd ..
npm ci && npm run typecheck && npm test
```

## Roadmap

1. **M0, foundations:** contract, docs, CI. ✅
2. **M1, pipeline v0:** Kochi pilot spots, FES2022 tides validated against the Cochin gauge.
3. **M2, `@threex/core`:** the 3X scoring engine, tide-flip analysis and the window planner.
4. **M3, app shell:** PWA, design system, map and offline cache.
5. **M4, screens:** map, spot detail, best-times planner, about & data.
6. **M5, expansion:** all of India.

## Data credits

Published catalogues are derived from OpenStreetMap (© OpenStreetMap contributors, ODbL) and other open datasets; see [docs/data-sources.md](docs/data-sources.md). ThreeX is not for navigation.
