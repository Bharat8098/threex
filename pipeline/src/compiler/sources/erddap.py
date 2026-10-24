"""Gridded subsets from NOAA CoastWatch ERDDAP (public domain): bathymetry, sea surface
temperature and chlorophyll-a."""

import csv
from datetime import date
from pathlib import Path

import numpy as np

from compiler.cache import cache_dir
from compiler.grid import Grid
from compiler.regions import Region
from compiler.sources.http import download

BASE = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"
MARGIN_DEG = 0.1


def _box(region: Region, *, lat_descending: bool = False) -> str:
    """Axis constraints for the region plus a margin, in the dataset's latitude order."""
    min_lon, min_lat, max_lon, max_lat = region.bbox
    south, north = min_lat - MARGIN_DEG, max_lat + MARGIN_DEG
    lat = f"[({north}):1:({south})]" if lat_descending else f"[({south}):1:({north})]"
    lon = f"[({min_lon - MARGIN_DEG}):1:({max_lon + MARGIN_DEG})]"
    return lat + lon


def fetch_bathymetry(region: Region) -> Path:
    """ETOPO 2022 15 arc-second relief (z, metres; negative below sea level)."""
    url = f"{BASE}/ETOPO_2022_v1_15s.csv?z{_box(region)}"
    return download(url, cache_dir() / "erddap" / f"{region.id}-etopo.csv")


def fetch_sst_monthly(region: Region, first_year: int, last_year: int) -> Path:
    """MUR SST monthly means, used to build monthly normals."""
    time = f"[({first_year}-01-01T00:00:00Z):1:({last_year}-12-31T00:00:00Z)]"
    url = f"{BASE}/jplMURSST41mday.csv?sst{time}{_box(region)}"
    dest = cache_dir() / "erddap" / f"{region.id}-sst-{first_year}-{last_year}.csv"
    return download(url, dest)


def fetch_chlorophyll_monthly(region: Region, first_year: int, last_year: int) -> Path:
    """MODIS Aqua science-quality monthly chlorophyll-a, used to build monthly normals.
    (Monthly normals beat a recent composite here: monsoon cloud blanks Kerala's
    weekly composites from June to September.)"""
    time = f"[({first_year}-01-01T00:00:00Z):1:({last_year}-12-31T00:00:00Z)]"
    url = f"{BASE}/erdMH1chlamday.csv?chlorophyll{time}{_box(region, lat_descending=True)}"
    dest = cache_dir() / "erddap" / f"{region.id}-chlorophyll-{first_year}-{last_year}.csv"
    return download(url, dest)


def _rows(path: Path, variable: str):
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        next(reader)  # units row
        columns = {name: i for i, name in enumerate(header)}
        for row in reader:
            value = row[columns[variable]]
            yield (
                row[columns["time"]] if "time" in columns else None,
                float(row[columns["latitude"]]),
                float(row[columns["longitude"]]),
                float(value) if value not in ("", "NaN") else np.nan,
            )


def _to_grid(points: list[tuple[float, float, float]]) -> Grid:
    lats = np.unique([p[0] for p in points])
    lons = np.unique([p[1] for p in points])
    values = np.full((lats.size, lons.size), np.nan)
    i = np.searchsorted(lats, [p[0] for p in points])
    j = np.searchsorted(lons, [p[1] for p in points])
    values[i, j] = [p[2] for p in points]
    return Grid(lats, lons, values)


def read_grid(path: Path, variable: str) -> Grid:
    """A single-time grid (bathymetry, or the latest chlorophyll composite)."""
    return _to_grid([(lat, lon, value) for _, lat, lon, value in _rows(path, variable)])


def read_monthly_normals(path: Path, variable: str, *, geometric: bool = False) -> list[Grid]:
    """Average a multi-year monthly series into 12 grids, January to December.
    `geometric` averages logarithms, the usual choice for log-normal chlorophyll."""
    by_month: dict[int, list[tuple[float, float, float]]] = {m: [] for m in range(1, 13)}
    for time, lat, lon, value in _rows(path, variable):
        month = date.fromisoformat(time[:10]).month
        by_month[month].append((lat, lon, value))
    normals = []
    for month in range(1, 13):
        points = by_month[month]
        lats = np.unique([p[0] for p in points])
        lons = np.unique([p[1] for p in points])
        total = np.zeros((lats.size, lons.size))
        count = np.zeros((lats.size, lons.size))
        i = np.searchsorted(lats, [p[0] for p in points])
        j = np.searchsorted(lons, [p[1] for p in points])
        v = np.array([p[2] for p in points])
        ok = ~np.isnan(v) & (v > 0 if geometric else True)
        if geometric:
            v = np.log(np.where(ok, v, 1.0))
        np.add.at(total, (i[ok], j[ok]), v[ok])
        np.add.at(count, (i[ok], j[ok]), 1)
        with np.errstate(invalid="ignore"):
            mean = np.where(count > 0, total / count, np.nan)
        normals.append(Grid(lats, lons, np.exp(mean) if geometric else mean))
    return normals
