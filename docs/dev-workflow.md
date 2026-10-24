# Development workflow

ThreeX can be built entirely from **Claude Code cloud sessions**: the data pipeline, the scoring engine and the web app. Nothing requires Xcode or the Apple Developer Program.

## Where to work

| Work | Where |
|---|---|
| Pipeline, `@threex/core`, web app, docs | cloud sessions (claude.ai/code, the Claude app, or `claude --cloud "…"` from a terminal) |
| Checking the app on an iPhone | open the PR's Cloudflare **preview URL** on the phone |
| Debugging on-device performance | Mac Safari → Develop → *your iPhone* → Web Inspector (needs a cable the first time) |
| Continuing a cloud session on your Mac | `claude --teleport <session-id>` from a clean checkout |
| Steering a local Mac session from your phone | `/remote-control` inside that session |

Cloud and local sessions draw from the same Claude plan usage, and the cloud VM has no separate charge.

## Commands

```sh
# Pipeline (Python 3.12+, uv; `build` also needs osmium-tool)
cd pipeline
uv sync                                # install
uv run pytest                          # tests (offline; no downloads)
uv run ruff check . && uv run ruff format --check .
uv run threex-compile schema           # models.py → schema/v1/threex.schema.json
uv run threex-compile fixtures         # regenerate fixtures/v1 (synthetic Kochi catalogue)
uv run threex-compile build --region kochi --out build   # real data → build/v1 + build/report
uv run threex-compile validate <dir>   # check a published catalogue

# TypeScript (Node 22+, npm workspaces)
npm ci
npm run gen:types                      # schema → packages/core/src/generated/contract.ts
npm run format:check                   # Prettier (npm run format to fix)
npm run typecheck
npm test
NODE_USE_ENV_PROXY=1 npm run demo -w @threex/core   # score a real build with live weather

# Web app (apps/web)
npm run dev -w @threex/web             # http://127.0.0.1:5173, gallery at /gallery
npm run build -w @threex/web           # production PWA → apps/web/dist
npm run preview -w @threex/web         # serve dist at http://127.0.0.1:4173 (service worker on)
npm run screenshots -w @threex/web     # iPhone/iPad × every mode → apps/web/screenshots/
```

### Running the web app locally

- **Data.** In dev and preview the app reads the catalogue from `/data`, which serves `pipeline/build` (run the Kochi build first), or the three-spot fixture catalogue when there is no build. A production build reads `https://threex-data.pages.dev`; set `VITE_DATA_URL` at build time to point it elsewhere. For example, `VITE_DATA_URL=/data npm run build -w @threex/web` then `preview` tests the production build against a local catalogue.
- **Weather** comes straight from Open-Meteo in the browser, one request per 0.05° cell of spot coordinates.
- **Scoring** runs in a Web Worker (`src/workers/score.worker.ts`) using `@threex/core`.
- **Routes:** `/`, `/spot/<id>` and `/about` are all served by `index.html` (the service worker's navigation fallback offline; Cloudflare Pages serves `index.html` for unknown paths when there is no `404.html`).
- **Screenshots** cover the list, spot detail, planner, About and `/gallery`. Weather is recorded on first use into `apps/web/screenshots/.weather/` and replayed for 6 hours, so every page sees the same conditions and a full run doesn't hit Open-Meteo's rate limit.
- **Cloud sessions:** Chromium and Playwright are preinstalled; never run `playwright install`. The screenshot script picks up the session's proxy from `HTTPS_PROXY`.

## Changing the data contract

1. Edit `pipeline/src/compiler/models.py`.
2. Run `uv run threex-compile schema && uv run threex-compile fixtures`.
3. Run `npm run gen:types`.
4. Update both sides' code and tests in the **same PR**.

CI fails if the schema, fixtures or generated types are stale.

## One-time setup

### Cloud environment
In the session title bar, open the environment menu → **Edit**.
- **Network access:** set Limited/Custom, keep **Allow package managers** ticked, and add the hosts listed in [data-sources.md](data-sources.md#network-access-in-cloud-sessions).
- Dependencies install automatically at session start through the repo's SessionStart hook (`.claude/hooks/session-start.sh`).

### Cloudflare Pages (free)
1. Create a Pages project **`threex`** connected to this GitHub repo.
   - Framework preset: *None*
   - Build command: `npm ci && npm run build -w @threex/web`
   - Build output directory: `apps/web/dist`
   - Environment variable: `NODE_VERSION` = `22`

   Every branch and PR gets a preview URL; `main` deploys to `threex.pages.dev`. The app reads its data from `threex-data.pages.dev`, so it shows "Couldn't load spots" until step 2's first deploy.
2. Create a Pages project **`threex-data`** for direct upload. The weekly `compile-data` workflow deploys the catalogue to it (with `pipeline/publish/_headers` for CORS and caching). Until the secrets below exist, the workflow still builds and uploads the catalogue as a run artifact.
3. Create an API token with *Cloudflare Pages: Edit*. Add it, and your account ID, as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### Data inputs
None need an account. The pipeline downloads every input (OSM extract, EOT20 tide grids, ETOPO, mangroves, ERDDAP climatologies, UHSLC, GloFAS) into `pipeline/.cache/`, so anyone can rebuild the catalogue from a fresh clone. See [data-sources.md](data-sources.md) and [pipeline.md](pipeline.md).

## Branches and PRs

- `main` is always green and deployable.
- Work happens on branches. Each PR gets CI plus a Cloudflare preview.
- Commit generated files (`schema/`, `fixtures/`, `packages/core/src/generated/`). CI checks they match their generators.
