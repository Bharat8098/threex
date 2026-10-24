"""EOT20 global ocean tide model (DGFI-TUM, CC BY 4.0), cropped to a region.

The SEANOE archive nests `ocean_tides.zip` (1.2 GB) beside `load_tides.zip`; only the ocean
member is downloaded. Each constituent is cropped to the region plus a margin and written in
the layout pyTMD expects (`<dir>/EOT20/ocean_tides/<C>_ocean_eot20.nc`), so CI only caches a
few megabytes.
"""

import tempfile
import zipfile
from pathlib import Path

import xarray as xr

from compiler.cache import cache_dir
from compiler.regions import Region
from compiler.sources.http import fetch_zip_member

URL = "https://www.seanoe.org/data/00683/79489/data/85762.zip"
CONSTITUENTS = [
    "2N2", "J1", "K1", "K2", "M2", "M4", "MF", "MM", "N2",
    "O1", "P1", "Q1", "S1", "S2", "SA", "SSA", "T2",
]  # fmt: skip
MARGIN_DEG = 1.0


def model_dir(region: Region) -> Path:
    """The directory to pass to pyTMD as `directory=`."""
    return cache_dir() / "tide-models" / region.id


def fetch(region: Region) -> Path:
    target = model_dir(region) / "EOT20" / "ocean_tides"
    wanted = [target / f"{c}_ocean_eot20.nc" for c in CONSTITUENTS]
    if all(path.exists() for path in wanted):
        return model_dir(region)

    archive = fetch_zip_member(
        URL, "ocean_tides.zip", cache_dir() / "raw" / "eot20-ocean_tides.zip"
    )
    target.mkdir(parents=True, exist_ok=True)
    min_lon, min_lat, max_lon, max_lat = region.bbox
    with zipfile.ZipFile(archive) as inner, tempfile.TemporaryDirectory() as tmp:
        for path in wanted:
            source = Path(inner.extract(f"ocean_tides/{path.name}", tmp))
            with xr.open_dataset(source) as ds:
                cropped = ds.sel(
                    lat=slice(min_lat - MARGIN_DEG, max_lat + MARGIN_DEG),
                    lon=slice(min_lon - MARGIN_DEG, max_lon + MARGIN_DEG),
                ).load()
            cropped.to_netcdf(path)
            source.unlink()
    return model_dir(region)
