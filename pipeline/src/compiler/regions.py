"""Build regions: the area a catalogue covers and the inputs specific to it."""

from typing import Annotated

from pydantic import Field

from compiler.models import Contract, Coordinate, Id
from compiler.paths import REPO_ROOT

REGIONS_DIR = REPO_ROOT / "config" / "regions"


class Gauge(Contract):
    id: Id
    name: str
    uhslc_id: int
    coordinate: Coordinate


class Region(Contract):
    id: Id
    name: str
    bbox: Annotated[
        tuple[float, float, float, float],
        Field(description="min lon, min lat, max lon, max lat"),
    ]
    osm_extract_url: str
    gauges: list[Gauge]
    tidal_river_max_inland_km: float = Field(
        gt=0,
        description=(
            "Rivers and canals farther than this from the open coast count as freshwater. "
            "Lagoons (backwaters) always count as estuary."
        ),
    )
    station_radius_km: float = Field(
        gt=0, description="Tidal spots this close to a gauge use the gauge's own harmonics."
    )

    @property
    def centre(self) -> Coordinate:
        min_lon, min_lat, max_lon, max_lat = self.bbox
        return Coordinate(lat=(min_lat + max_lat) / 2, lon=(min_lon + max_lon) / 2)

    def contains(self, lat: float, lon: float) -> bool:
        min_lon, min_lat, max_lon, max_lat = self.bbox
        return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def load_region(name: str) -> Region:
    """Load `config/regions/<name>.json`."""
    return Region.model_validate_json((REGIONS_DIR / f"{name}.json").read_bytes())
