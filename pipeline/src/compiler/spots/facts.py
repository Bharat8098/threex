"""Facts about each candidate spot: nearby cover, habitat, depth and productivity normals."""

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from shapely.geometry import Point

from compiler.grid import Grid
from compiler.models import Feature, FeatureKind, Habitat, River, WaterType
from compiler.spots.candidates import MIN_BRIDGE_SPAN_M, Candidate
from compiler.spots.layers import Layers

FEATURE_RADIUS_M = 200
MAX_FEATURES = 8
MANGROVE_FLOOD_CM = 0  # mangrove edges flood, and shelter fish, from about mean sea level up
HABITAT_RADIUS_M = {"mangrove": 10_000, "reef": 10_000, "weed": 5_000, "mouth": 20_000}
SST_RADIUS_M = 15_000
CHLOROPHYLL_RADIUS_M = 10_000
DEPTH_SEARCH_M = 500
SLOPE_WINDOW_M = 700
DROP_OFF_SLOPE = 2.0  # metres of depth per 100 m


@dataclass(frozen=True)
class Grids:
    bathymetry: Grid
    sst_normals: list[Grid]
    chlorophyll_normals: list[Grid]


@dataclass(frozen=True)
class Facts:
    features: list[Feature]
    habitat: Habitat
    depth_m: float | None
    depth_slope: float | None
    river: River | None
    sources: set[str]


def _nearest(
    layers: Layers, layer: str, point: Point, radius: float, kind: FeatureKind
) -> float | None:
    """Distance to the nearest `kind` in a layer, if within `radius` (spatially indexed)."""
    distances = [
        item.geometry.distance(point)
        for item in layers.within(layer, point, radius)
        if item.kind is kind
    ]
    nearest = min(distances, default=None)
    return round(nearest) if nearest is not None and nearest <= radius else None


def nearby_features(candidate: Candidate, layers: Layers, mouths: list[Point]) -> list[Feature]:
    """The nearest feature of each kind within reach, closest first."""
    point = candidate.point
    best: dict[FeatureKind, Feature] = {}

    def offer(kind: FeatureKind, distance: float, source: str, min_tide_cm: int | None = None):
        if distance > FEATURE_RADIUS_M:
            return
        current = best.get(kind)
        if current is None or distance < current.distance_m:
            best[kind] = Feature(
                kind=kind, distance_m=round(distance), min_tide_cm=min_tide_cm, source=source
            )

    for structure in layers.within("structures", point, FEATURE_RADIUS_M):
        offer(structure.kind, structure.geometry.distance(point), structure.source)
    for patch in layers.within("vegetation", point, FEATURE_RADIUS_M):
        flood = MANGROVE_FLOOD_CM if patch.kind is FeatureKind.MANGROVE_EDGE else None
        offer(patch.kind, patch.geometry.boundary.distance(point), patch.source, flood)
    for bridge, _, _ in layers.within("bridges", point, FEATURE_RADIUS_M):
        spans_water = (
            bridge.distance(point) <= FEATURE_RADIUS_M
            and bridge.length >= MIN_BRIDGE_SPAN_M
            and any(bridge.intersects(w.geometry) for w in layers.within("water", point, 300))
        )
        if spans_water:
            offer(FeatureKind.BRIDGE_PILINGS, bridge.distance(point), "osm")
    for mouth in mouths:
        offer(FeatureKind.RIVER_MOUTH, mouth.distance(point), "osm")
    return sorted(best.values(), key=lambda f: f.distance_m)[:MAX_FEATURES]


def depth_at(bathymetry: Grid, lat: float, lon: float) -> tuple[float | None, float | None]:
    """(depth below MSL, steepest nearby slope in m per 100 m) from the nearest sea cell."""
    nearest = bathymetry.nearest_valid(lat, lon, DEPTH_SEARCH_M, where=lambda z: z < 0)
    if nearest is None:
        return None, None
    depth = round(-nearest[0], 1)
    window = bathymetry.window(lat, lon, SLOPE_WINDOW_M)
    if window.lats.size < 2 or window.lons.size < 2:
        return depth, None
    dy = (window.lats[1] - window.lats[0]) * 110_574.0
    dx = (window.lons[1] - window.lons[0]) * 111_320.0 * np.cos(np.radians(lat))
    z = window.values
    gy, gx = np.gradient(z, dy, dx)
    slope = np.hypot(gx, gy) * 100
    sea = z < 0
    if not sea.any():
        return depth, None
    return depth, round(float(np.nanmax(np.where(sea, slope, np.nan))), 1)


def _monthly(grids: list[Grid], lat: float, lon: float, radius: float, digits: int):
    values = []
    for grid in grids:
        found = grid.nearest_valid(lat, lon, radius)
        if found is None:
            return None
        values.append(round(found[0], digits))
    return values


def spot_facts(
    candidate: Candidate,
    layers: Layers,
    grids: Grids,
    mouths: list[Point],
    discharge: Callable[[float, float], float | None],
) -> Facts:
    point = candidate.point
    lon, lat = (float(v) for v in layers.projection.to_lonlat(point.x, point.y))
    tidal = candidate.water_type is not WaterType.FRESHWATER

    features = nearby_features(candidate, layers, mouths)
    depth, slope = depth_at(grids.bathymetry, lat, lon)
    if slope is not None and slope >= DROP_OFF_SLOPE:
        features = sorted(
            [*features, Feature(kind=FeatureKind.DROP_OFF, distance_m=0, source="etopo2022")],
            key=lambda f: f.distance_m,
        )[:MAX_FEATURES]

    mouth = min((m.distance(point) for m in mouths), default=None)
    habitat = Habitat(
        mangrove_m=_nearest(
            layers, "vegetation", point, HABITAT_RADIUS_M["mangrove"], FeatureKind.MANGROVE_EDGE
        ),
        reef_m=_nearest(layers, "structures", point, HABITAT_RADIUS_M["reef"], FeatureKind.REEF),
        weed_bed_m=_nearest(
            layers, "vegetation", point, HABITAT_RADIUS_M["weed"], FeatureKind.WEED_BED
        ),
        river_mouth_m=round(mouth)
        if mouth is not None and mouth <= HABITAT_RADIUS_M["mouth"]
        else None,
        sst_normal_c=_monthly(grids.sst_normals, lat, lon, SST_RADIUS_M, 1) if tidal else None,
        chlorophyll_normal_mg_m3=(
            _monthly(grids.chlorophyll_normals, lat, lon, CHLOROPHYLL_RADIUS_M, 2)
            if tidal
            else None
        ),
    )

    river = None
    if not tidal and any(w.kind in ("river", "canal") for w in layers.within("water", point, 100)):
        median = discharge(lat, lon)
        river = River(discharge_median_cumecs=median) if median else None

    sources = {"osm", candidate.source} | {f.source for f in features}
    if habitat.mangrove_m is not None:
        sources.add("gmw")
    if depth is not None:
        sources.add("etopo2022")
    if habitat.sst_normal_c or habitat.chlorophyll_normal_mg_m3:
        sources.add("coastwatch")
    if river is not None:
        sources.add("glofas")
    return Facts(features, habitat, depth, slope, river, sources)


def spot_confidence(water_type: WaterType, facts: Facts) -> float:
    """How complete the facts are: a 0–1 score the app shows beside the rating."""
    score = {WaterType.COASTAL: 0.85, WaterType.ESTUARY: 0.7, WaterType.FRESHWATER: 0.65}[
        water_type
    ]
    if facts.depth_m is None:
        score -= 0.1
    if water_type is not WaterType.FRESHWATER and facts.habitat.sst_normal_c is None:
        score -= 0.1
    if water_type is WaterType.FRESHWATER and facts.river is None:
        score -= 0.1
    if not facts.features:
        score -= 0.15
    return round(min(0.95, max(0.2, score)), 2)
