import numpy as np
import pytest

from compiler.sources import erddap, uhslc

CSV = """time,latitude,longitude,sst
UTC,degrees_north,degrees_east,degree_C
2020-01-16T00:00:00Z,10.0,76.0,28.0
2020-01-16T00:00:00Z,10.0,76.01,NaN
2021-01-16T00:00:00Z,10.0,76.0,29.0
2021-01-16T00:00:00Z,10.0,76.01,27.0
2020-07-16T00:00:00Z,10.0,76.0,26.0
2020-07-16T00:00:00Z,10.0,76.01,26.5
"""


def test_monthly_normals_average_years_and_skip_gaps(tmp_path) -> None:
    path = tmp_path / "sst.csv"
    path.write_text(CSV)
    normals = erddap.read_monthly_normals(path, "sst")
    assert len(normals) == 12
    assert normals[0].values.tolist() == [[28.5, 27.0]]
    assert normals[6].values.tolist() == [[26.0, 26.5]]
    assert np.isnan(normals[3].values).all() if normals[3].values.size else True


def test_geometric_normals(tmp_path) -> None:
    path = tmp_path / "chl.csv"
    path.write_text(
        "time,latitude,longitude,chlorophyll\nUTC,degrees_north,degrees_east,mg m-3\n"
        "2020-03-16T00:00:00Z,10.0,76.0,1.0\n2021-03-16T00:00:00Z,10.0,76.0,100.0\n"
    )
    normals = erddap.read_monthly_normals(path, "chlorophyll", geometric=True)
    assert normals[2].values[0, 0] == pytest.approx(10.0)


def test_single_grid(tmp_path) -> None:
    path = tmp_path / "z.csv"
    path.write_text(
        "latitude,longitude,z\ndegrees_north,degrees_east,m\n"
        "10.0,76.0,-5\n10.0,76.01,3\n10.01,76.0,-7\n10.01,76.01,1\n"
    )
    grid = erddap.read_grid(path, "z")
    assert grid.values.tolist() == [[-5.0, 3.0], [-7.0, 1.0]]


def test_uhslc_csv(tmp_path) -> None:
    path = tmp_path / "h174.csv"
    path.write_text("2024,1,1,0,1234\n2024,1,1,1,-32767\n2024,1,1,2,1300\n")
    times, heights = uhslc.load(path)
    assert str(times[2]) == "2024-01-01T02:00:00"
    assert heights[0] == 123.4 and np.isnan(heights[1])
