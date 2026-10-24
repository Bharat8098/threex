"""A local metric projection. Regions span tens of kilometres, so an equirectangular
projection about the region centre keeps distance errors well under 1%."""

import math
from dataclasses import dataclass

import numpy as np
import shapely
from shapely.geometry.base import BaseGeometry

_M_PER_DEG_LAT = 110_574.0
_M_PER_DEG_LON_EQUATOR = 111_320.0


@dataclass(frozen=True)
class LocalProjection:
    lat0: float
    lon0: float

    @property
    def _kx(self) -> float:
        return _M_PER_DEG_LON_EQUATOR * math.cos(math.radians(self.lat0))

    def to_xy(self, lon, lat):
        """Degrees to metres east/north of the origin. Accepts scalars or arrays."""
        return (np.asarray(lon) - self.lon0) * self._kx, (
            np.asarray(lat) - self.lat0
        ) * _M_PER_DEG_LAT

    def to_lonlat(self, x, y):
        return np.asarray(x) / self._kx + self.lon0, np.asarray(y) / _M_PER_DEG_LAT + self.lat0

    def project(self, geometry: BaseGeometry) -> BaseGeometry:
        """Project a lon/lat shapely geometry into metres."""
        return shapely.transform(geometry, lambda c: np.column_stack(self.to_xy(c[:, 0], c[:, 1])))

    def unproject(self, geometry: BaseGeometry) -> BaseGeometry:
        return shapely.transform(
            geometry, lambda c: np.column_stack(self.to_lonlat(c[:, 0], c[:, 1]))
        )
