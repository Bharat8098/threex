"""Regular lat/lon grids (bathymetry, sea temperature, chlorophyll) with point lookups."""

from dataclasses import dataclass

import numpy as np

from compiler.projection import LocalProjection


@dataclass(frozen=True)
class Grid:
    """`values[i, j]` sits at (`lats[i]`, `lons[j]`); both axes ascend. NaN means no data."""

    lats: np.ndarray
    lons: np.ndarray
    values: np.ndarray

    def __post_init__(self) -> None:
        if self.values.shape != (self.lats.size, self.lons.size):
            raise ValueError("values must be shaped (lats, lons)")
        if np.any(np.diff(self.lats) <= 0) or np.any(np.diff(self.lons) <= 0):
            raise ValueError("grid axes must ascend")

    def nearest_valid(
        self,
        lat: float,
        lon: float,
        max_distance_m: float,
        *,
        where=None,
    ) -> tuple[float, float] | None:
        """Value of the nearest cell that has data (and satisfies `where`, if given),
        with its distance in metres; None if none lies within `max_distance_m`.
        Only the cells within reach are examined, so lookups stay fast on state-sized grids."""
        near = self.window(lat, lon, max_distance_m)
        if near.lats.size == 0 or near.lons.size == 0:
            return None
        return near._nearest_in(lat, lon, max_distance_m, where)

    def _nearest_in(self, lat, lon, max_distance_m, where) -> tuple[float, float] | None:
        projection = LocalProjection(lat, lon)
        lon_grid, lat_grid = np.meshgrid(self.lons, self.lats)
        x, y = projection.to_xy(lon_grid, lat_grid)
        distance = np.hypot(x, y)
        ok = ~np.isnan(self.values) & (distance <= max_distance_m)
        if where is not None:
            ok &= where(self.values)
        if not ok.any():
            return None
        index = np.unravel_index(np.argmin(np.where(ok, distance, np.inf)), distance.shape)
        return float(self.values[index]), float(distance[index])

    def window(self, lat: float, lon: float, radius_m: float) -> "Grid":
        """The sub-grid within `radius_m` of a point (a square window)."""
        dlat = radius_m / 110_574.0
        dlon = radius_m / (111_320.0 * np.cos(np.radians(lat)))
        i0, i1 = np.searchsorted(self.lats, [lat - dlat, lat + dlat], side="left")
        j0, j1 = np.searchsorted(self.lons, [lon - dlon, lon + dlon], side="left")
        i1 += int(i1 < self.lats.size and self.lats[i1] == lat + dlat)
        j1 += int(j1 < self.lons.size and self.lons[j1] == lon + dlon)
        return Grid(self.lats[i0:i1], self.lons[j0:j1], self.values[i0:i1, j0:j1])
