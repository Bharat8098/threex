"""Gather every input a region build needs, fetching whatever is missing or stale."""

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from compiler.regions import Region
from compiler.sources import eot20, erddap, gmw, osm, uhslc

SST_YEARS = (2016, 2025)
CHLOROPHYLL_YEARS = (2012, 2021)  # the MODIS science-quality record ends in 2022


@dataclass(frozen=True)
class Inputs:
    osm: Path
    tide_model_dir: Path
    gauges: dict[str, Path]
    bathymetry: Path
    sst_monthly: Path
    chlorophyll_monthly: Path
    mangrove_tiles: list[Path]


def gather(region: Region, log: Callable[[str], None] = print) -> Inputs:
    steps: list[tuple[str, Callable[[], object]]] = [
        ("OpenStreetMap", lambda: osm.fetch(region)),
        ("EOT20 tide model", lambda: eot20.fetch(region)),
        ("UHSLC gauges", lambda: {g.id: uhslc.fetch(g) for g in region.gauges}),
        ("ETOPO 2022 bathymetry", lambda: erddap.fetch_bathymetry(region)),
        ("MUR sea temperature", lambda: erddap.fetch_sst_monthly(region, *SST_YEARS)),
        ("MODIS chlorophyll", lambda: erddap.fetch_chlorophyll_monthly(region, *CHLOROPHYLL_YEARS)),
        ("Global Mangrove Watch", lambda: gmw.fetch(region)),
    ]
    results = []
    for label, step in steps:
        log(f"· {label}")
        results.append(step())
    return Inputs(*results)
