"""Global Mangrove Watch v4.0.19 mangrove extent for 2020 (10 m, CC BY 4.0)."""

import math
import zipfile
from pathlib import Path

import numpy as np
import rasterio
import rasterio.features
import rasterio.windows
import shapely
from shapely.geometry import shape

from compiler.cache import cache_dir
from compiler.regions import Region
from compiler.sources.http import download

URL = "https://zenodo.org/records/12756047/files/gmw_mng_2020_v4019_gtiff.zip"


def _tile_names(region: Region) -> list[str]:
    """Candidate 1° tile names around the region (the naming convention's corner is checked
    against real bounds when loading, so over-including is harmless)."""
    min_lon, min_lat, max_lon, max_lat = region.bbox
    names = []
    for lat in range(math.floor(min_lat) - 1, math.ceil(max_lat) + 1):
        for lon in range(math.floor(min_lon) - 1, math.ceil(max_lon) + 1):
            ns = f"N{lat:02d}" if lat >= 0 else f"S{-lat:02d}"
            ew = f"E{lon:03d}" if lon >= 0 else f"W{-lon:03d}"
            names.append(f"GMW_{ns}{ew}_v4019_mng.tif")
    return names


def fetch(region: Region) -> list[Path]:
    archive = download(URL, cache_dir() / "raw" / "gmw_mng_2020_v4019_gtiff.zip")
    out_dir = cache_dir() / "gmw"
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    with zipfile.ZipFile(archive) as z:
        members = set(z.namelist())
        for name in _tile_names(region):
            if name in members:
                dest = out_dir / name
                if not dest.exists():
                    dest.write_bytes(z.read(name))
                paths.append(dest)
    return paths


def load_polygons(paths: list[Path], region: Region, min_area_deg2: float = 2e-7) -> list:
    """Mangrove polygons (lon/lat) inside the region, from every tile that overlaps it."""
    min_lon, min_lat, max_lon, max_lat = region.bbox
    polygons = []
    for path in paths:
        with rasterio.open(path) as src:
            left, bottom, right, top = src.bounds
            if right < min_lon or left > max_lon or top < min_lat or bottom > max_lat:
                continue
            window = (
                rasterio.windows.from_bounds(
                    max(min_lon, left),
                    max(min_lat, bottom),
                    min(max_lon, right),
                    min(max_lat, top),
                    src.transform,
                )
                .round_offsets()
                .round_lengths()
            )
            data = src.read(1, window=window)
            mask = (data == 1).astype(np.uint8)
            transform = src.window_transform(window)
            for geometry, value in rasterio.features.shapes(mask, mask=mask, transform=transform):
                if value == 1:
                    polygon = shape(geometry)
                    if polygon.area >= min_area_deg2:
                        polygons.append(polygon)
    return [shapely.make_valid(p) for p in polygons]
