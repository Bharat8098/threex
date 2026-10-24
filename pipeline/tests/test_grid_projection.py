import numpy as np
import pytest
from shapely.geometry import LineString

from compiler.grid import Grid
from compiler.projection import LocalProjection


def test_projection_round_trip_and_scale() -> None:
    projection = LocalProjection(10.0, 76.0)
    x, y = projection.to_xy(76.01, 10.01)
    assert float(x) == pytest.approx(1096, rel=0.01)  # 0.01° of longitude at 10°N
    assert float(y) == pytest.approx(1106, rel=0.01)
    lon, lat = projection.to_lonlat(x, y)
    assert (float(lon), float(lat)) == pytest.approx((76.01, 10.01))
    line = projection.project(LineString([(76.0, 10.0), (76.0, 10.01)]))
    assert line.length == pytest.approx(1106, rel=0.01)


def test_nearest_valid_skips_gaps_and_honours_where() -> None:
    lats = np.array([10.0, 10.01, 10.02])
    lons = np.array([76.0, 76.01, 76.02])
    values = np.array([[np.nan, 5.0, -3.0], [np.nan, np.nan, -8.0], [1.0, 2.0, 3.0]])
    grid = Grid(lats, lons, values)

    value, distance = grid.nearest_valid(10.0, 76.0, 2_000)
    assert value == 5.0 and distance == pytest.approx(1096, rel=0.01)
    value, _ = grid.nearest_valid(10.0, 76.0, 5_000, where=lambda z: z < 0)
    assert value == -3.0
    assert grid.nearest_valid(10.0, 76.0, 500) is None


def test_grid_rejects_descending_axes() -> None:
    with pytest.raises(ValueError):
        Grid(np.array([2.0, 1.0]), np.array([1.0]), np.zeros((2, 1)))
