"""`threex-compile`: the data compiler's command line."""

import filecmp
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

import typer

from compiler.fixtures import build_fixture_catalogue
from compiler.paths import FIXTURES_DIR, SCHEMA_FILE
from compiler.publish.layout import VERSION_DIR, read_catalogue, write_catalogue
from compiler.schema import render_schema

app = typer.Typer(no_args_is_help=True, help="Compile public data into the ThreeX catalogue.")

RegionOption = Annotated[
    str, typer.Option("--region", help="Region config name in config/regions/.")
]
CheckOption = Annotated[
    bool, typer.Option("--check", help="Fail instead of writing if the committed copy is stale.")
]


def _fail(message: str) -> None:
    typer.secho(message, fg=typer.colors.RED, err=True)
    raise typer.Exit(1)


@app.command()
def schema(check: CheckOption = False) -> None:
    """Export the data contract to schema/v1/threex.schema.json."""
    rendered = render_schema()
    if check:
        if not SCHEMA_FILE.exists() or SCHEMA_FILE.read_text() != rendered:
            _fail(f"{SCHEMA_FILE} is stale; run `uv run threex-compile schema`.")
        typer.echo("Schema is up to date.")
        return
    SCHEMA_FILE.parent.mkdir(parents=True, exist_ok=True)
    SCHEMA_FILE.write_text(rendered)
    typer.echo(f"Wrote {SCHEMA_FILE}")


def _stale_files(expected: Path, actual: Path) -> list[str]:
    comparison = filecmp.dircmp(expected, actual)
    stale = comparison.left_only + comparison.right_only + comparison.diff_files
    for name, sub in comparison.subdirs.items():
        stale += [f"{name}/{path}" for path in _stale_files(sub.left, sub.right)]
    return stale


@app.command()
def fixtures(check: CheckOption = False) -> None:
    """Regenerate the synthetic Kochi fixture catalogue in fixtures/v1."""
    catalogue = build_fixture_catalogue()
    if check:
        with tempfile.TemporaryDirectory() as tmp:
            write_catalogue(catalogue, Path(tmp), pretty=True)
            stale = _stale_files(Path(tmp) / VERSION_DIR, FIXTURES_DIR / VERSION_DIR)
        if stale:
            _fail(f"Fixtures are stale ({', '.join(stale)}); run `uv run threex-compile fixtures`.")
        typer.echo("Fixtures are up to date.")
        return
    write_catalogue(catalogue, FIXTURES_DIR, pretty=True)
    typer.echo(f"Wrote {FIXTURES_DIR / VERSION_DIR}")


@app.command()
def validate(
    path: Annotated[Path, typer.Argument(help="Directory containing a published v1/ catalogue.")],
) -> None:
    """Check a published catalogue: schema, hashes and cross-file references."""
    try:
        catalogue = read_catalogue(path)
    except (OSError, ValueError) as error:
        _fail(f"Invalid catalogue: {error}")
        return
    spots = sum(len(tile.spots) for tile in catalogue.tiles)
    typer.echo(f"OK: {len(catalogue.tiles)} tiles, {spots} spots, data {catalogue.data_version}.")


@app.command()
def fetch(region: RegionOption = "kochi") -> None:
    """Download (or reuse cached) inputs for a region."""
    from compiler.inputs import gather
    from compiler.regions import load_region

    gather(load_region(region), log=typer.echo)
    typer.echo("Inputs ready.")


@app.command()
def build(
    region: RegionOption = "kochi",
    out: Annotated[Path, typer.Option("--out", help="Output directory.")] = Path("build"),
) -> None:
    """Fetch inputs, compile the region's catalogue into <out>/v1, and write a report."""
    from compiler.build import build_catalogue
    from compiler.inputs import gather
    from compiler.regions import load_region
    from compiler.report import write_geojson, write_report
    from compiler.sources.glofas import median_discharge

    started = time.monotonic()

    def log(message: str) -> None:
        typer.echo(f"{time.monotonic() - started:7.1f}s {message}")

    config = load_region(region)
    inputs = gather(config, log=log)
    catalogue, report = build_catalogue(
        config, inputs, now=datetime.now(UTC), discharge=median_discharge, log=log
    )
    manifest = write_catalogue(catalogue, out)
    read_catalogue(out)  # re-validate what was written
    write_report(report, out / "report")
    write_geojson(report, out / "report")
    spots = sum(t.spot_count for t in manifest.tiles)
    typer.echo(f"Wrote {out / VERSION_DIR}: {len(manifest.tiles)} tiles, {spots} spots.")
