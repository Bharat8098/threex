# ThreeX: notes for Claude

ThreeX is a PWA (iPhone-first, also iPad and desktop) that recommends fishing spots using the 3X framework: Comfort, Safety and Food. India is the launch region. Read `docs/3x-framework.md` before touching scoring, `docs/pipeline.md` before touching the data compiler, and `docs/design-system.md` before touching UI.

## Architecture rules

- **The pipeline publishes facts; `@threex/core` scores.** Never compute a pillar score, X or rating anywhere except `packages/core`.
- **The data contract lives in `pipeline/src/compiler/models.py`.** After changing it:
  1. run `uv run threex-compile schema && uv run threex-compile fixtures` (in `pipeline/`);
  2. run `npm run gen:types`;
  3. update both sides in the same change.

  Never hand-edit `schema/`, `fixtures/v1/` or `packages/core/src/generated/`.
- **Thresholds and weights live in `config/scoring-config.json`, not in code.** After retuning, run the golden scenarios and the demo, bump the config `version`, and add a row to the tuning log in `docs/3x-framework.md`.
- **No accounts, analytics, trackers or third-party SDKs.** Don't add them without asking. Store nothing about the user except a purgeable cache and an appearance preference.
- **The user's location never leaves the device.** Weather and marine requests use spot coordinates.
- **Keep data credits visible** (`pipeline/src/compiler/attributions.py`, About & Data screen, map attribution).
- **OSM physical features only.** Never use `leisure=fishing` or other crowdsourced catch data.
- **After changing spot rules, rebuild Kochi and look.** Read `build/report/build-report.md`, and render `build/report/spots.geojson` on a map before saying a change works. Unit tests use synthetic data and stay offline.

## UI rules

- **Use design tokens only.** No raw colours, font sizes or easing curves in components.
- **Light mode first.**
  - Tint *text and icons* use the `-ink` tokens; tint *backgrounds* use the `-fill` tokens with label-coloured text.
  - Never put white text on a light-mode tint fill.
- **Glass is for the control layer only.** Never stack it, and never put it on content.
- **Animate only transform and opacity.**
- Every animation must respect `prefers-reduced-motion`.
- After any UI change, take Playwright screenshots at iPhone and iPad sizes in light, dark, high-contrast and reduced-motion modes, and look at them before saying it's done.

## Commands

```sh
cd pipeline && uv sync && uv run pytest && uv run ruff check . && uv run ruff format --check .
cd pipeline && uv run threex-compile schema --check && uv run threex-compile fixtures --check
cd pipeline && uv run threex-compile build --region kochi --out build   # real data; needs osmium-tool
npm ci && npm run gen:types && npm run format:check && npm run typecheck && npm test
NODE_USE_ENV_PROXY=1 npm run demo -w @threex/core   # engine on the real Kochi build + live weather
```

## Environment

- Cloud sessions run on Linux. The data hosts must be allowed in the environment's network settings; see `docs/data-sources.md`.
- ThreeX is **open source**. Every data input must be openly licensed and downloadable without an account. Never commit large inputs (`*.osm.pbf`, `*.nc`, tide-model grids); the pipeline downloads them into `pipeline/.cache/`.
