"""OpenStreetMap (ODbL): structures, water, access routes, exclusion zones and place names.

The country extract is clipped to the region and filtered with osmium-tool, then exported as
GeoJSON text sequences that `load` turns into shapely geometries. Only physical features are
read; catch reports and fishing tags are deliberately ignored.
"""

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path

import shapely
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry

from compiler.cache import cache_dir
from compiler.regions import Region
from compiler.sources.http import download

# osmium tags-filter expressions: everything the spot builder reads.
TAG_FILTERS = [
    "nwr/man_made=breakwater,groyne,pier,jetty",
    "w/natural=coastline",
    "nwr/natural=water,reef,rock,bare_rock,wetland",
    "nwr/water",
    "nwr/waterway=river,canal,riverbank,tidal_channel,weir,dam",
    "nwr/wetland=mangrove,reedbed",
    "nwr/seamark:type=wreck,rock",
    "nwr/landuse=military,reservoir,basin,port",
    "nwr/military",
    "nwr/industrial=port,shipyard",
    "nwr/boundary=protected_area",
    "nwr/leisure=nature_reserve",
    "nwr/aeroway=aerodrome",
    "w/highway",
    "n/place=city,town,suburb,village,neighbourhood,quarter,hamlet",
]


@dataclass(frozen=True)
class OsmElement:
    id: str
    tags: dict[str, str]
    geometry: BaseGeometry  # lon/lat

    @property
    def name(self) -> str | None:
        return self.tags.get("name:en") or self.tags.get("name")


def _osmium(*args: str) -> None:
    subprocess.run(["osmium", *args, "--overwrite", "--no-progress"], check=True)


def fetch(region: Region) -> Path:
    country = download(
        region.osm_extract_url,
        cache_dir() / "raw" / Path(region.osm_extract_url).name,
        max_age_days=6,
    )
    out_dir = cache_dir() / "osm"
    out_dir.mkdir(parents=True, exist_ok=True)
    clipped = out_dir / f"{region.id}.osm.pbf"
    filtered = out_dir / f"{region.id}-filtered.osm.pbf"
    exported = out_dir / f"{region.id}.geojsonseq"
    if exported.exists() and exported.stat().st_mtime >= country.stat().st_mtime:
        return exported
    bbox = ",".join(str(v) for v in region.bbox)
    _osmium("extract", "--bbox", bbox, "--strategy", "smart", "-o", str(clipped), str(country))
    _osmium("tags-filter", str(clipped), *TAG_FILTERS, "-o", str(filtered))
    _osmium(
        "export", str(filtered), "-f", "geojsonseq", "--add-unique-id", "type_id",
        "-x", "print_record_separator=false", "-o", str(exported),
    )  # fmt: skip
    return exported


def load(path: Path) -> list[OsmElement]:
    """Read the export. osmium writes a closed way twice, as a line (`w<id>`) and as an area
    (`a<2*id>`); the area wins, except for coastline, which is always a line."""
    features = [json.loads(line) for line in path.open()]
    area_way_ids = {
        int(f["id"][1:]) // 2
        for f in features
        if f["id"].startswith("a") and int(f["id"][1:]) % 2 == 0
    }
    elements = []
    for feature in features:
        tags = {k: str(v) for k, v in (feature.get("properties") or {}).items()}
        osm_id = feature["id"]
        if (
            osm_id.startswith("w")
            and int(osm_id[1:]) in area_way_ids
            and tags.get("natural") != "coastline"
        ):
            continue
        if feature["id"].startswith("a") and tags.get("natural") == "coastline":
            continue
        geometry = shape(feature["geometry"])
        if geometry.is_empty:
            continue
        if not geometry.is_valid:
            geometry = shapely.make_valid(geometry)
        elements.append(OsmElement(osm_id, tags, geometry))
    return elements
