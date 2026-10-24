"""Sort raw OpenStreetMap elements and mangrove polygons into the layers the spot builder
reads, projected into metres around the region centre."""

from dataclasses import dataclass, field

import numpy as np
import shapely
from scipy.spatial import cKDTree
from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, Point
from shapely.geometry.base import BaseGeometry

from compiler.grid import Grid
from compiler.models import FeatureKind
from compiler.projection import LocalProjection
from compiler.sources.osm import OsmElement

STRUCTURE_TAGS: dict[tuple[str, str], FeatureKind] = {
    ("man_made", "breakwater"): FeatureKind.BREAKWATER,
    ("man_made", "groyne"): FeatureKind.GROYNE,
    ("man_made", "pier"): FeatureKind.PIER,
    ("man_made", "jetty"): FeatureKind.JETTY,
    ("natural", "reef"): FeatureKind.REEF,
    ("seamark:type", "wreck"): FeatureKind.WRECK,
    ("seamark:type", "rock"): FeatureKind.ROCKS,
    ("natural", "rock"): FeatureKind.ROCKS,
    ("natural", "bare_rock"): FeatureKind.ROCKS,
    ("waterway", "weir"): FeatureKind.WEIR,
    ("waterway", "dam"): FeatureKind.DAM,
}
VEGETATION_TAGS: dict[tuple[str, str], FeatureKind] = {
    ("wetland", "mangrove"): FeatureKind.MANGROVE_EDGE,
    ("wetland", "reedbed"): FeatureKind.WEED_BED,
    ("wetland", "marsh"): FeatureKind.WEED_BED,
    ("wetland", "swamp"): FeatureKind.WEED_BED,
}
# natural=water subtypes. Ponds are almost always private in Kerala, so they never count.
WATER_KINDS = {
    None: "water",
    "river": "river",
    "canal": "canal",
    "stream": "river",
    "oxbow": "river",
    "lagoon": "lagoon",
    "lake": "lake",
    "reservoir": "reservoir",
    "basin": "reservoir",
}
WATERWAY_LINES = {"river": "river", "canal": "canal", "tidal_channel": "tidal"}
FRESHWATER_KINDS = frozenset({"lake", "reservoir"})
# Coastal "lakes" this large are lagoons (Kerala's backwaters are mapped as water=lake), as is
# anything named kayal (Malayalam for backwater), backwater or lagoon.
LAGOON_MIN_AREA_M2 = 5_000_000
LAGOON_NAME = ("kayal", "backwater", "lagoon")
NO_ACCESS_HIGHWAYS = frozenset(
    {"motorway", "motorway_link", "construction", "proposed", "raceway", "bus_guideway"}
)
EXCLUSION_TAGS: dict[tuple[str, str | None], str] = {
    ("landuse", "military"): "military area",
    ("military", None): "military area",
    ("industrial", "port"): "port",
    ("industrial", "shipyard"): "shipyard",
    ("landuse", "port"): "port",
    ("boundary", "protected_area"): "protected area",
    ("leisure", "nature_reserve"): "nature reserve",
    ("aeroway", "aerodrome"): "airport",
}
PLACE_RANK = {
    "city": 0, "town": 1, "suburb": 2, "quarter": 3, "village": 3, "neighbourhood": 4, "hamlet": 5,
}  # fmt: skip
OPEN_SEA_MAX_Z = -1.0  # ETOPO cells deeper than this, connected to the grid edge, are open sea


@dataclass(frozen=True)
class Structure:
    kind: FeatureKind
    geometry: BaseGeometry  # metres
    name: str | None
    source: str  # attribution id
    osm_id: str | None = None


@dataclass(frozen=True)
class Water:
    kind: str  # water, river, canal, tidal, lagoon, lake, reservoir
    geometry: BaseGeometry  # metres
    tidal: bool = False


@dataclass(frozen=True)
class Place:
    point: Point  # metres
    name: str
    rank: int


@dataclass
class Layers:
    projection: LocalProjection
    structures: list[Structure] = field(default_factory=list)
    vegetation: list[Structure] = field(default_factory=list)
    water: list[Water] = field(default_factory=list)
    coastline: list[BaseGeometry] = field(default_factory=list)
    access: list[BaseGeometry] = field(default_factory=list)
    bridges: list[tuple[BaseGeometry, str | None, str]] = field(default_factory=list)
    exclusions: list[tuple[BaseGeometry, str]] = field(default_factory=list)
    places: list[Place] = field(default_factory=list)
    open_sea: np.ndarray = field(default_factory=lambda: np.empty((0, 2)))

    def __post_init__(self) -> None:
        self._trees: dict[str, STRtree] = {}

    def tree(self, layer: str) -> STRtree:
        """A spatial index over one layer's geometries, built on first use."""
        if layer not in self._trees:
            items = getattr(self, layer)
            geometries = [self._geometry(item) for item in items]
            self._trees[layer] = STRtree(geometries)
        return self._trees[layer]

    @staticmethod
    def _geometry(item) -> BaseGeometry:
        if isinstance(item, BaseGeometry):
            return item
        if isinstance(item, tuple):
            return item[0]
        return item.geometry if hasattr(item, "geometry") else item.point

    def nearest_distance(self, layer: str, point: Point, max_distance: float) -> float | None:
        items = getattr(self, layer)
        if not items:
            return None
        index = self.tree(layer).query_nearest(point, max_distance=max_distance)
        if len(index) == 0:
            return None
        return float(min(self._geometry(items[i]).distance(point) for i in index))

    def within(self, layer: str, point: Point, distance: float) -> list:
        items = getattr(self, layer)
        if not items:
            return []
        index = self.tree(layer).query(point, predicate="dwithin", distance=distance)
        return [items[i] for i in index]

    def distance_to_open_sea(self, point: Point) -> float:
        if len(self.open_sea) == 0:
            return float("inf")
        if "open_sea" not in self._trees:
            self._trees["open_sea"] = cKDTree(self.open_sea)  # type: ignore[assignment]
        distance, _ = self._trees["open_sea"].query([point.x, point.y])  # type: ignore[attr-defined]
        return float(distance)


def _bridge_name(tags: dict[str, str]) -> str | None:
    """A bridge way's `name` is usually the road's; only use it if it names a bridge."""
    explicit = tags.get("bridge:name:en") or tags.get("bridge:name")
    if explicit:
        return explicit
    name = tags.get("name:en") or tags.get("name")
    return name if name and "bridge" in name.lower() else None


def _match(tags: dict[str, str], table: dict) -> object | None:
    for (key, value), result in table.items():
        if key in tags and (value is None or tags[key] == value):
            return result
    return None


def _areal(geometry: BaseGeometry) -> bool:
    return geometry.geom_type in ("Polygon", "MultiPolygon")


def open_sea_cells(bathymetry: Grid, projection: LocalProjection) -> np.ndarray:
    """Centres (metres) of grid cells in the sea connected to the grid's edge. Harbours and
    backwaters too shallow or narrow for the grid read as land, which is what we want."""
    from scipy.ndimage import label

    sea = np.nan_to_num(bathymetry.values, nan=1.0) < OPEN_SEA_MAX_Z
    labels, _ = label(sea)
    edge = np.unique(np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]))
    connected = np.isin(labels, edge[edge > 0])
    i, j = np.nonzero(connected)
    x, y = projection.to_xy(bathymetry.lons[j], bathymetry.lats[i])
    return np.column_stack([x, y])


def build_layers(
    elements: list[OsmElement],
    mangroves: list[BaseGeometry],
    bathymetry: Grid,
    projection: LocalProjection,
) -> Layers:
    layers = Layers(projection)
    for element in elements:
        tags = element.tags
        geometry = projection.project(element.geometry)

        if tags.get("leisure") == "fishing":
            continue  # crowdsourced fishing reports are never used

        if (kind := _match(tags, STRUCTURE_TAGS)) is not None:
            if kind is FeatureKind.PIER and "jetty" in (element.name or "").lower():
                kind = FeatureKind.JETTY
            layers.structures.append(Structure(kind, geometry, element.name, "osm", element.id))
            continue

        if (kind := _match(tags, VEGETATION_TAGS)) is not None and _areal(geometry):
            layers.vegetation.append(Structure(kind, geometry, element.name, "osm", element.id))
            continue

        if (reason := _match(tags, EXCLUSION_TAGS)) is not None:
            if _areal(geometry):
                layers.exclusions.append((geometry, reason))
            continue

        if tags.get("natural") == "coastline":
            layers.coastline.append(geometry)
            continue

        tidal = tags.get("tidal") == "yes" or tags.get("salt") == "yes"
        if tags.get("natural") == "water" and _areal(geometry):
            water_kind = WATER_KINDS.get(tags.get("water"))
            if water_kind == "lake" and (
                geometry.area >= LAGOON_MIN_AREA_M2
                or any(word in (element.name or "").lower() for word in LAGOON_NAME)
            ):
                water_kind = "lagoon"
            if water_kind is not None:
                layers.water.append(Water(water_kind, geometry, tidal))
            continue
        if tags.get("waterway") == "riverbank" and _areal(geometry):
            layers.water.append(Water("river", geometry, tidal))
            continue
        if tags.get("landuse") in ("reservoir", "basin") and _areal(geometry):
            layers.water.append(Water("reservoir", geometry, tidal))
            continue
        if (line_kind := WATERWAY_LINES.get(tags.get("waterway", ""))) is not None:
            layers.water.append(Water(line_kind, geometry, tidal or line_kind == "tidal"))
            continue

        if "highway" in tags and isinstance(geometry, (LineString, MultiLineString)):
            if tags["highway"] in NO_ACCESS_HIGHWAYS or tags.get("access") in ("private", "no"):
                continue
            layers.access.append(geometry)
            if tags.get("bridge", "no") != "no":
                layers.bridges.append((geometry, _bridge_name(tags), element.id))
            continue

        rank = PLACE_RANK.get(tags.get("place", ""))
        if rank is not None and element.name and isinstance(geometry, Point):
            layers.places.append(Place(geometry, element.name, rank))

    for polygon in mangroves:
        projected = projection.project(polygon)
        layers.vegetation.append(Structure(FeatureKind.MANGROVE_EDGE, projected, None, "gmw"))

    layers.open_sea = open_sea_cells(bathymetry, projection)
    return layers


def union(geometries: list[BaseGeometry]) -> BaseGeometry:
    return shapely.union_all(geometries) if geometries else shapely.GeometryCollection()
