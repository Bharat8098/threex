"""University of Hawaii Sea Level Center fast-delivery hourly tide gauge data."""

from pathlib import Path

import numpy as np

from compiler.cache import cache_dir
from compiler.regions import Gauge
from compiler.sources.http import download

MISSING = -32767


def fetch(gauge: Gauge) -> Path:
    url = f"https://uhslc.soest.hawaii.edu/data/csv/fast/hourly/h{gauge.uhslc_id:03d}.csv"
    return download(url, cache_dir() / "uhslc" / f"h{gauge.uhslc_id:03d}.csv", max_age_days=6)


def load(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """Hourly UTC times (datetime64[s]) and sea level in cm, NaN where missing."""
    rows = np.loadtxt(path, delimiter=",", dtype=np.int64, ndmin=2)
    times = np.array(
        [f"{y:04d}-{m:02d}-{d:02d}T{h:02d}:00:00" for y, m, d, h in rows[:, :4]],
        dtype="datetime64[s]",
    )
    heights = np.where(rows[:, 4] == MISSING, np.nan, rows[:, 4] / 10.0)
    return times, heights
