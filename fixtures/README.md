# Fixtures

`v1/` is a tiny **synthetic** catalogue in exactly the layout the pipeline publishes. Both test suites load it:

- `pipeline/tests`: pydantic validation, hashes, round-trip.
- `packages/core/test`: JSON Schema validation and cross-file references, through the same path the app takes (manifest → tiles → scoring).

Place names are real, so the UI reads naturally in tests. **Every fact, tide height and validation number is made up.** Never publish these files or treat them as data.

It contains three spots across two tiles, one for each water type:

| Spot | Tile | Water type | What it exercises |
|---|---|---|---|
| Fort Kochi Breakwater | `t9y0` | coastal | structure cover, tide cluster, SST normals |
| Vypin Mangrove Edge | `t9y0` | estuary | `minTideCm` (cover only near high tide), lower confidence |
| Periyar at Aluva Manalpuram | `t9y3` | freshwater | no tide, river discharge, unknown depth |

Do not edit these files by hand. Change `pipeline/src/compiler/fixtures.py`, then run:

```sh
cd pipeline && uv run threex-compile fixtures
```

CI fails if the committed files drift from the generator (`threex-compile fixtures --check`).
