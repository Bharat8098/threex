"""Build a whole catalogue from synthetic inputs and read it back through the validator."""

import math
from datetime import UTC, datetime

import numpy as np
from test_spots import FEATURES, REGION, _bathymetry

from compiler.build import TIDE_DAYS, build_catalogue
from compiler.inputs import Inputs
from compiler.models import Coordinate, WaterType
from compiler.publish.layout import read_catalogue, write_catalogue
from compiler.regions import Gauge, Region
from compiler.tides import predict

GAUGE = Gauge(
    id="uhslc-999", name="Testpur Harbour", uhslc_id=999, coordinate=Coordinate(lat=10.0, lon=75.99)
)


def _tide(times: np.ndarray) -> np.ndarray:
    hours = (times.astype("datetime64[s]").astype(np.int64) - 1.6e9) / 3600
    return 40 * np.cos(2 * math.pi * hours / 12.4206) + 15 * np.cos(2 * math.pi * hours / 23.9345)


def _write_grid_csv(path, variable, rows):
    with path.open("w") as f:
        header = (
            ["time", "latitude", "longitude", variable]
            if len(rows[0]) == 4
            else ["latitude", "longitude", variable]
        )
        f.write(",".join(header) + "\n" + ",".join(["x"] * len(header)) + "\n")
        for row in rows:
            f.write(",".join(str(v) for v in row) + "\n")
    return path


def _inputs(tmp_path, write_osm) -> Inputs:
    grid = _bathymetry()
    bathymetry = _write_grid_csv(
        tmp_path / "z.csv",
        "z",
        [
            (lat, lon, grid.values[i, j])
            for i, lat in enumerate(grid.lats)
            for j, lon in enumerate(grid.lons)
        ],
    )
    sea_cells = [(lat, lon) for lat in (9.98, 10.0, 10.02) for lon in (75.97, 75.98, 75.99)]
    monthly = lambda value: [  # noqa: E731
        (f"2020-{m:02d}-16T00:00:00Z", lat, lon, value)
        for m in range(1, 13)
        for lat, lon in sea_cells
    ]
    sst = _write_grid_csv(tmp_path / "sst.csv", "sst", monthly(28.5))
    chlorophyll = _write_grid_csv(tmp_path / "chl.csv", "chlorophyll", monthly(2.0))

    times = np.datetime64("2023-01-01T00:00:00") + np.arange(900 * 24) * np.timedelta64(3600, "s")
    heights_mm = np.round((_tide(times) + 150) * 10).astype(int)
    gauge = tmp_path / "h999.csv"
    with gauge.open("w") as f:
        for t, h in zip(times.astype(datetime), heights_mm, strict=True):
            f.write(f"{t.year},{t.month},{t.day},{t.hour},{h}\n")

    return Inputs(
        osm=write_osm(FEATURES),
        tide_model_dir=tmp_path,
        gauges={GAUGE.id: gauge},
        bathymetry=bathymetry,
        sst_monthly=sst,
        chlorophyll_monthly=chlorophyll,
        mangrove_tiles=[],
    )


def test_build_catalogue_end_to_end(tmp_path, write_osm, monkeypatch) -> None:
    # Stand-in for EOT20: the true tide, 20 minutes late, so the gauge's own fit wins.
    late = np.timedelta64(20 * 60, "s")
    monkeypatch.setattr(predict, "predict_eot20", lambda _dir, _lat, _lon, t: _tide(t - late))
    region = Region(**{**REGION.model_dump(), "gauges": [GAUGE]})

    catalogue, report = build_catalogue(
        region,
        _inputs(tmp_path, write_osm),
        now=datetime(2026, 11, 1, 6, 30, tzinfo=UTC),
        discharge=lambda lat, lon: 42.0,
        log=lambda _: None,
    )

    write_catalogue(catalogue, tmp_path / "out")
    assert read_catalogue(tmp_path / "out") == catalogue

    (gauge,) = report.gauges
    assert gauge.prefer_station
    assert gauge.check.station.rmse_cm < gauge.check.eot20.rmse_cm

    spots = [s for tile in catalogue.tiles for s in tile.spots]
    assert {s.water_type for s in spots} == set(WaterType)
    tidal = [s for s in spots if s.water_type is not WaterType.FRESHWATER]
    assert all(s.tide_cluster_id == "tc-uhslc-999" for s in tidal)
    assert all("uhslc" in s.sources for s in tidal)

    series = next(t for tile in catalogue.tiles for t in tile.tides)
    assert series.model == "uhslc-harmonics"
    assert series.start == datetime(2026, 11, 1, tzinfo=UTC)
    assert len(series.heights_cm) == TIDE_DAYS * 24 + 1
    assert series.validation.station_id == "uhslc-999"
    assert 30 < series.mean_range_cm < 120

    coastal = next(s for s in spots if s.name.startswith("Breakwater"))
    assert coastal.habitat.sst_normal_c == [28.5] * 12
    assert coastal.depth_m == 20.0
    assert catalogue.valid_until == datetime(2026, 12, 16, tzinfo=UTC)
    assert {a.id for a in catalogue.attributions} >= {"osm", "uhslc", "coastwatch", "etopo2022"}
