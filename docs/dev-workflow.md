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
# Pipeline (Python 3.12+, uv)
cd pipeline
uv sync                                # install
uv run pytest                          # tests
uv run ruff check . && uv run ruff format --check .
uv run threex-compile schema           # models.py → schema/v1/threex.schema.json
uv run threex-compile fixtures         # regenerate fixtures/v1 (synthetic Kochi catalogue)
uv run threex-compile validate <dir>   # check a published catalogue

# TypeScript (Node 22+, npm workspaces)
npm ci
npm run gen:types                      # schema → packages/core/src/generated/contract.ts
npm run typecheck
npm test
```

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
   - Build command: `npm ci && npm run build -w apps/web`
   - Output directory: `apps/web/dist`

   Every branch and PR gets a preview URL; `main` deploys to `threex.pages.dev`. *(Needed from M3, once the web app exists.)*
2. Create a Pages project **`threex-data`** for direct upload. The weekly `compile-data` workflow deploys the catalogue to it. *(Needed from M1.)*
3. Create an API token with *Cloudflare Pages: Edit*. Add it, and your account ID, as GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

### AVISO+ (FES2022 tides)
1. Register at AVISO+ and accept the FES licence.
2. Download the India-region subset of the FES2022 ocean-tide grids once, wherever FTP works (for example on your Mac).
3. Attach it as a release asset on a **private** repository. The FES licence doesn't allow redistribution, and `threex` is public.

## Branches and PRs

- `main` is always green and deployable.
- Work happens on branches. Each PR gets CI plus a Cloudflare preview.
- Commit generated files (`schema/`, `fixtures/`, `packages/core/src/generated/`). CI checks they match their generators.
