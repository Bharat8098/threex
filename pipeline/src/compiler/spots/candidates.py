"""Turn map layers into candidate fishing spots.

1. **Anchors.** Every structure (its seaward tip), every bridge where it crosses real water,
   every river mouth, and points along mangrove and reed edges that touch water.
2. **Filters.** Drop anchors inside exclusion zones, away from water, or too far from a
   public road or path.
3. **Water type.** Coastal within 1 km of open sea; otherwise estuary or freshwater by
   distance inland and the kind of water nearby.
4. **Clustering.** Keep the strongest anchor in every 150 m, so one breakwater is one spot.
5. **Names.** The OSM name when there is one, else "<kind> <distance> <direction> of <place>".
"""

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass

import numpy as np
from shapely.geometry import LineString, MultiLineString, Point
from shapely.geometry.base import BaseGeometry

from compiler.models import FeatureKind, WaterType
from compiler.regions import Region
from compiler.spots.layers import FRESHWATER_KINDS, Layers, Structure

# Walkable structures: reachable when any part touches a road or path.
WALKABLE = frozenset(
    {FeatureKind.BREAKWATER, FeatureKind.GROYNE, FeatureKind.PIER, FeatureKind.JETTY}
)
PRIORITY = {
    FeatureKind.BREAKWATER: 0, FeatureKind.GROYNE: 0, FeatureKind.PIER: 0, FeatureKind.JETTY: 0,
    FeatureKind.REEF: 0, FeatureKind.WRECK: 0, FeatureKind.ROCKS: 1, FeatureKind.WEIR: 1,
    FeatureKind.DAM: 1, FeatureKind.BRIDGE_PILINGS: 1, FeatureKind.RIVER_MOUTH: 2,
    FeatureKind.MANGROVE_EDGE: 3, FeatureKind.WEED_BED: 3,
}  # fmt: skip
LABEL = {
    FeatureKind.BREAKWATER: "Breakwater", FeatureKind.GROYNE: "Groyne", FeatureKind.PIER: "Pier",
    FeatureKind.JETTY: "Jetty", FeatureKind.REEF: "Reef", FeatureKind.WRECK: "Wreck",
    FeatureKind.ROCKS: "Rocks", FeatureKind.WEIR: "Weir", FeatureKind.DAM: "Dam",
    FeatureKind.BRIDGE_PILINGS: "Bridge", FeatureKind.RIVER_MOUTH: "River mouth",
    FeatureKind.MANGROVE_EDGE: "Mangrove edge", FeatureKind.WEED_BED: "Reed edge",
}  # fmt: skip

CLUSTER_RADIUS_M = 150
MAX_ACCESS_M = 300
WALKABLE_TOUCH_M = 30
NEAR_WATER_M = 40
EXCLUSION_BUFFER_M = 30
COASTAL_SEA_M = 1000
OPEN_SEA_CELL_HALF_DIAGONAL_M = 330  # ETOPO 15" cells
MIN_BRIDGE_SPAN_M = 60
MOUTH_TO_COAST_M = 300
EDGE_SPACING_M = 300
EDGE_MIN_AREA_M2 = 5_000
EDGE_THINNING_M = {FeatureKind.MANGROVE_EDGE: 600, FeatureKind.WEED_BED: 800}
# Structures whose names mark them as working or restricted facilities.
RESTRICTED_NAME = re.compile(
    r"\b(navy|naval|coast ?guard|bunker|oil|cargo|container|mooring|embarkation|dry ?dock|"
    r"shipyard|refinery|lng|terminal berth|private)\b",
    re.IGNORECASE,
)
PLACEHOLDER_NAME = re.compile(r"^(need name|unnamed|no name|fixme|todo)$", re.IGNORECASE)
KIND_WORDS = re.compile(
    r"\b(pier|jetty|wharf|terminal|breakwater|groyne|bridge|weir|dam|reef|wreck|rocks?|"
    r"boat ?jetty|ferry|landing|kadavu)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Anchor:
    point: Point  # metres
    kind: FeatureKind
    name: str | None
    source: str
    structure: Structure | None = None


@dataclass(frozen=True)
class Candidate:
    point: Point  # metres
    kind: FeatureKind
    name: str
    locality: str | None
    water_type: WaterType
    access_distance_m: float
    source: str


@dataclass
class CandidateReport:
    anchors: Counter
    dropped: Counter
    kept: Counter


# ---------------------------------------------------------------------------
# Anchors
# ---------------------------------------------------------------------------


def _or(value: float | None, default: float) -> float:
    return default if value is None else value


def _points_of(geometry: BaseGeometry) -> list[Point]:
    if isinstance(geometry, LineString):
        return [Point(geometry.coords[0]), Point(geometry.coords[-1])]
    if isinstance(geometry, MultiLineString):
        return [p for line in geometry.geoms for p in _points_of(line)]
    if geometry.geom_type == "Polygon":
        return [Point(c) for c in geometry.exterior.coords]
    if geometry.geom_type == "MultiPolygon":
        return [Point(c) for poly in geometry.geoms for c in poly.exterior.coords]
    return [geometry.representative_point()]


def structure_tip(structure: Structure, layers: Layers) -> Point:
    """The part of a structure farthest from roads and paths: a breakwater's head, a pier's
    end. Point features are their own tip."""
    if structure.geometry.geom_type == "Point":
        return structure.geometry
    if structure.kind in (FeatureKind.WEIR, FeatureKind.DAM):
        if isinstance(structure.geometry, LineString):
            return structure.geometry.interpolate(0.5, normalized=True)
        return structure.geometry.representative_point()
    candidates = _points_of(structure.geometry)
    distances = [_or(layers.nearest_distance("access", p, 3000), 3000.0) for p in candidates]
    return candidates[int(np.argmax(distances))]


def structure_anchors(layers: Layers) -> list[Anchor]:
    return [
        Anchor(structure_tip(s, layers), s.kind, s.name, s.source, s) for s in layers.structures
    ]


def bridge_anchors(layers: Layers) -> list[Anchor]:
    """Where bridges span rivers, lagoons, lakes or reservoirs (not small canals)."""
    anchors = []
    for bridge, name, _ in layers.bridges:
        for water in layers.within("water", bridge.centroid, bridge.length + 50):
            if water.kind == "canal" or not bridge.intersects(water.geometry):
                continue
            crossing = bridge.intersection(water.geometry)
            if water.geometry.geom_type in ("Polygon", "MultiPolygon"):
                if crossing.length < MIN_BRIDGE_SPAN_M:
                    continue
                parts = getattr(crossing, "geoms", [crossing])
                longest = max(parts, key=lambda g: g.length)
                point = longest.interpolate(0.5, normalized=True)
            else:
                if bridge.length < MIN_BRIDGE_SPAN_M:
                    continue
                point = crossing if crossing.geom_type == "Point" else crossing.centroid
            anchors.append(Anchor(point, FeatureKind.BRIDGE_PILINGS, name, "osm"))
            break
    return anchors


def river_mouths(layers: Layers) -> list[Point]:
    """River ends that meet the coast or the open sea."""
    mouths = []
    for water in layers.water:
        if water.kind != "river" or water.geometry.geom_type not in ("LineString",):
            continue
        for end in _points_of(water.geometry):
            near_coast = layers.nearest_distance("coastline", end, MOUTH_TO_COAST_M) is not None
            if near_coast or layers.distance_to_open_sea(end) <= 2 * MOUTH_TO_COAST_M:
                mouths.append(end)
    return mouths


def _near_water(layers: Layers, point: Point, distance: float) -> bool:
    return (
        bool(layers.within("water", point, distance))
        or layers.nearest_distance("coastline", point, distance) is not None
        or layers.distance_to_open_sea(point) <= distance + OPEN_SEA_CELL_HALF_DIAGONAL_M
    )


class PointSet:
    """Points bucketed into square cells, so "is any point within r?" checks only the
    neighbouring cells instead of every point kept so far."""

    def __init__(self, radius: float):
        self.radius = radius
        self._cells: dict[tuple[int, int], list[Point]] = defaultdict(list)

    def _cell(self, point: Point) -> tuple[int, int]:
        return int(point.x // self.radius), int(point.y // self.radius)

    def near(self, point: Point) -> bool:
        cx, cy = self._cell(point)
        return any(
            point.distance(other) < self.radius
            for dx in (-1, 0, 1)
            for dy in (-1, 0, 1)
            for other in self._cells.get((cx + dx, cy + dy), ())
        )

    def add(self, point: Point) -> None:
        self._cells[self._cell(point)].append(point)


def edge_anchors(layers: Layers) -> list[Anchor]:
    """Points every 300 m along mangrove and reed edges that touch water, thinned so a long
    shoreline doesn't become dozens of spots."""
    anchors: list[Anchor] = []
    for kind, spacing in EDGE_THINNING_M.items():
        kept = PointSet(spacing)
        for patch in layers.vegetation:
            if patch.kind is not kind or patch.geometry.area < EDGE_MIN_AREA_M2:
                continue
            boundary = patch.geometry.boundary
            steps = max(1, int(boundary.length // EDGE_SPACING_M))
            for k in range(steps):
                point = boundary.interpolate(k / steps, normalized=True)
                if not _near_water(layers, point, NEAR_WATER_M):
                    continue
                if kept.near(point):
                    continue
                kept.add(point)
                anchors.append(Anchor(point, kind, patch.name, patch.source))
    return anchors


# ---------------------------------------------------------------------------
# Classification, filters, clustering and names
# ---------------------------------------------------------------------------


def water_type(layers: Layers, point: Point, region: Region) -> WaterType:
    sea = max(0.0, layers.distance_to_open_sea(point) - OPEN_SEA_CELL_HALF_DIAGONAL_M)
    if sea <= COASTAL_SEA_M:
        return WaterType.COASTAL
    nearby = layers.within("water", point, 100)
    if any(w.tidal or w.kind == "lagoon" for w in nearby):
        return WaterType.ESTUARY
    if nearby and all(w.kind in FRESHWATER_KINDS for w in nearby):
        return WaterType.FRESHWATER
    if sea <= region.tidal_river_max_inland_km * 1000:
        return WaterType.ESTUARY
    return WaterType.FRESHWATER


def _drop_reason(anchor: Anchor, layers: Layers) -> str | None:
    footprint = anchor.structure.geometry if anchor.structure is not None else anchor.point
    for zone, reason in layers.within("exclusions", footprint, EXCLUSION_BUFFER_M):
        if zone.distance(footprint) <= EXCLUSION_BUFFER_M:
            return reason
    if anchor.structure is not None and anchor.name and RESTRICTED_NAME.search(anchor.name):
        return "restricted facility"
    if anchor.kind in (FeatureKind.ROCKS,) and not _near_water(layers, anchor.point, NEAR_WATER_M):
        return "not by water"
    walkable = anchor.structure is not None and anchor.kind in WALKABLE
    if walkable:
        if layers.nearest_distance("access", anchor.structure.geometry, WALKABLE_TOUCH_M) is None:
            return "no public access"
    elif layers.nearest_distance("access", anchor.point, MAX_ACCESS_M) is None:
        return "no public access"
    return None


_COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _bearing(origin: Point, target: Point) -> str:
    angle = math.degrees(math.atan2(target.x - origin.x, target.y - origin.y)) % 360
    return _COMPASS[int((angle + 22.5) // 45) % 8]


def usable_name(name: str | None) -> str | None:
    """An OSM name fit for an English UI: Latin script, not a placeholder, tidied."""
    if not name:
        return None
    name = " ".join(name.split())
    if PLACEHOLDER_NAME.match(name) or any(ord(ch) > 0x24F for ch in name):
        return None
    return name.title() if name.isupper() or name.islower() else name


def _nearest_place(layers: Layers, point: Point, max_rank: int, radius: float):
    best = None
    for place in layers.within("places", point, radius):
        if place.rank <= max_rank:
            distance = place.point.distance(point)
            if best is None or distance < best[1]:
                best = (place, distance)
    return best


def name_for(anchor: Anchor, layers: Layers) -> tuple[str, str | None]:
    """(name, locality) for a spot."""
    town = _nearest_place(layers, anchor.point, 2, 10_000)
    locality = town[0].name if town else None
    named = usable_name(anchor.name)
    if named and anchor.kind not in (FeatureKind.MANGROVE_EDGE, FeatureKind.WEED_BED):
        if not KIND_WORDS.search(named):
            named = f"{named} {LABEL[anchor.kind]}"
        return named, locality
    near = _nearest_place(layers, anchor.point, 5, 4_000) or _nearest_place(
        layers, anchor.point, 5, 15_000
    )
    label = LABEL[anchor.kind]
    if near is None:
        return label, locality
    place, distance = near
    if distance < 400:
        return f"{label}, {place.name}", locality or place.name
    return (
        f"{label} {distance / 1000:.1f} km {_bearing(place.point, anchor.point)} of {place.name}",
        locality or place.name,
    )


def build_candidates(layers: Layers, region: Region) -> tuple[list[Candidate], CandidateReport]:
    anchors = structure_anchors(layers) + bridge_anchors(layers) + edge_anchors(layers)
    anchors += [
        Anchor(p, FeatureKind.RIVER_MOUTH, None, "osm")
        for p in river_mouths(layers)
        if layers.nearest_distance("access", p, MAX_ACCESS_M) is not None
    ]
    report = CandidateReport(Counter(a.kind.value for a in anchors), Counter(), Counter())

    accepted: list[Anchor] = []
    for anchor in anchors:
        reason = _drop_reason(anchor, layers)
        if reason:
            report.dropped[reason] += 1
        else:
            accepted.append(anchor)

    accepted.sort(key=lambda a: (PRIORITY[a.kind], a.name is None))
    spots: list[Anchor] = []
    taken = PointSet(CLUSTER_RADIUS_M)
    for anchor in accepted:
        if taken.near(anchor.point):
            report.dropped["merged into a nearby spot"] += 1
            continue
        taken.add(anchor.point)
        spots.append(anchor)

    candidates = []
    names: Counter = Counter()
    for anchor in spots:
        name, locality = name_for(anchor, layers)
        names[name] += 1
        if names[name] > 1:
            name = f"{name} ({names[name]})"
        candidates.append(
            Candidate(
                point=anchor.point,
                kind=anchor.kind,
                name=name[:80],
                locality=locality[:80] if locality else None,
                water_type=water_type(layers, anchor.point, region),
                access_distance_m=round(
                    layers.nearest_distance("access", anchor.point, 5_000) or 0.0
                ),
                source=anchor.source,
            )
        )
        report.kept[candidates[-1].water_type.value] += 1
    return candidates, report
