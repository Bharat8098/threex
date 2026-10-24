"""Spot rules on a small synthetic coast: sea to the west of 75.995°E, a road along 76°E."""

import numpy as np
import pytest
from shapely.geometry import LineString, Point, Polygon, box

from compiler.grid import Grid
from compiler.models import FeatureKind, WaterType
from compiler.projection import LocalProjection
from compiler.regions import Region
from compiler.sources import osm
from compiler.spots.candidates import build_candidates, usable_name
from compiler.spots.layers import build_layers

REGION = Region(
    id="test-region",
    name="Test",
    bbox=(75.95, 9.95, 76.1, 10.05),
    osm_extract_url="https://example.org/test.osm.pbf",
    gauges=[],
    tidal_river_max_inland_km=10,
    station_radius_km=15,
)
PROJECTION = LocalProjection(10.0, 76.0)


def _bathymetry() -> Grid:
    lats = np.arange(9.95, 10.05, 1 / 240)
    lons = np.arange(75.95, 76.10, 1 / 240)
    values = np.where(lons[None, :] < 75.995, -20.0, 5.0) * np.ones((lats.size, 1))
    return Grid(lats, lons, values)


def _pier(osm_id: str, lat: float, name: str | None = None):
    tags = {"man_made": "pier", **({"name": name} if name else {})}
    return (osm_id, tags, LineString([(76.0, lat), (75.9965, lat)]))


FEATURES = [
    ("w1", {"natural": "coastline"}, LineString([(75.995, 9.95), (75.995, 10.05)])),
    ("w2", {"highway": "residential"}, LineString([(76.0, 9.96), (76.0, 10.04)])),
    ("w3", {"man_made": "breakwater"}, LineString([(76.0, 10.0), (75.99, 10.0)])),
    _pier("w4", 10.02),
    ("a1002", {"landuse": "military"}, box(75.995, 10.015, 76.002, 10.025)),
    _pier("w5", 10.03, "Indian Oil Bunker Jetty"),
    _pier("w6", 9.98),
    _pier("w7", 9.9807),
    _pier("w8", 9.97, "കൊച്ചി ജെട്ടി"),
    ("a2002", {"natural": "water", "water": "river"}, box(76.030, 9.96, 76.035, 9.995)),
    (
        "w9",
        {"highway": "secondary", "bridge": "yes", "name": "Kadavu Bridge"},
        LineString([(76.0, 9.975), (76.04, 9.975)]),
    ),
    ("a3002", {"natural": "water", "water": "reservoir"}, box(76.06, 10.0, 76.07, 10.01)),
    ("w11", {"highway": "track"}, LineString([(76.06, 9.99), (76.06, 10.02)])),
    ("w12", {"man_made": "pier"}, LineString([(76.0601, 10.005), (76.063, 10.005)])),
    ("n1", {"place": "village", "name": "Testpur"}, Point(76.005, 10.0)),
    ("n2", {"leisure": "fishing"}, Point(76.0, 9.99)),
]


@pytest.fixture
def layers(write_osm):
    elements = osm.load(write_osm(FEATURES))
    mangrove = box(76.035, 9.97, 76.04, 9.99)
    return build_layers(elements, [mangrove], _bathymetry(), PROJECTION)


@pytest.fixture
def built(layers):
    return build_candidates(layers, REGION)


def _by_kind(candidates, kind):
    return [c for c in candidates if c.kind is kind]


def test_layers_sort_elements(layers) -> None:
    kinds = {s.kind for s in layers.structures}
    assert kinds == {FeatureKind.BREAKWATER, FeatureKind.PIER, FeatureKind.JETTY}  # "...Jetty"
    assert len(layers.exclusions) == 1 and layers.exclusions[0][1] == "military area"
    assert {w.kind for w in layers.water} == {"river", "reservoir"}
    assert len(layers.open_sea) > 0
    assert len(layers.bridges) == 1


def test_breakwater_spot_sits_at_its_seaward_tip(built) -> None:
    candidates, _ = built
    (breakwater,) = _by_kind(candidates, FeatureKind.BREAKWATER)
    lon, lat = PROJECTION.to_lonlat(breakwater.point.x, breakwater.point.y)
    assert (float(lon), float(lat)) == pytest.approx((75.99, 10.0), abs=1e-6)
    assert breakwater.water_type is WaterType.COASTAL
    assert breakwater.name == "Breakwater 1.6 km W of Testpur"


def test_exclusions_restricted_names_and_clustering(built) -> None:
    candidates, report = built
    assert report.dropped["military area"] == 1
    assert report.dropped["restricted facility"] == 1
    assert report.dropped["merged into a nearby spot"] >= 1
    assert not any("Bunker" in c.name for c in candidates)


def test_bridge_over_river_is_an_estuary_spot(built) -> None:
    candidates, _ = built
    (bridge,) = _by_kind(candidates, FeatureKind.BRIDGE_PILINGS)
    assert bridge.name == "Kadavu Bridge"
    assert bridge.water_type is WaterType.ESTUARY


def test_reservoir_pier_is_freshwater(built) -> None:
    candidates, _ = built
    freshwater = [c for c in candidates if c.water_type is WaterType.FRESHWATER]
    assert [c.kind for c in freshwater] == [FeatureKind.PIER]


def test_mangrove_edges_by_water_become_spots(built) -> None:
    candidates, _ = built
    assert _by_kind(candidates, FeatureKind.MANGROVE_EDGE)


def test_unusable_names_are_replaced(built) -> None:
    candidates, _ = built
    assert not any(any(ord(ch) > 0x24F for ch in c.name) for c in candidates)
    assert usable_name("Need Name") is None
    assert usable_name("BOAT PEN") == "Boat Pen"
    assert usable_name("  Vypin   Jetty ") == "Vypin Jetty"


def test_large_lakes_and_kayals_are_lagoons(write_osm) -> None:
    features = [
        ("a1", {"natural": "water", "water": "lake"}, box(76.0, 10.0, 76.03, 10.02)),
        (
            "a3",
            {"natural": "water", "water": "lake", "name": "Foo Kayal"},
            box(76, 9.97, 76.001, 9.971),
        ),
        ("a5", {"natural": "water", "water": "lake"}, box(76.0, 9.96, 76.001, 9.961)),
        ("a7", {"natural": "water", "water": "pond"}, box(76.0, 9.95, 76.001, 9.951)),
    ]
    layers = build_layers(osm.load(write_osm(features)), [], _bathymetry(), PROJECTION)
    assert sorted(w.kind for w in layers.water) == ["lagoon", "lagoon", "lake"]


def test_closed_ways_are_read_once_as_areas(write_osm) -> None:
    ring = Polygon([(76.0, 10.0), (76.01, 10.0), (76.01, 10.01), (76.0, 10.0)])
    features = [
        ("w5", {"man_made": "pier"}, LineString(ring.exterior.coords)),
        ("a10", {"man_made": "pier"}, ring),
        ("w6", {"natural": "coastline"}, LineString(ring.exterior.coords)),
        ("a12", {"natural": "coastline"}, ring),
    ]
    elements = osm.load(write_osm(features))
    assert sorted(e.id for e in elements) == ["a10", "w6"]
