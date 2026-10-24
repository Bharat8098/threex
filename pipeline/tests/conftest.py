import json
from pathlib import Path

import pytest
from shapely.geometry import mapping


@pytest.fixture
def write_osm(tmp_path):
    """Write OsmElement-like dicts as an osmium GeoJSON text sequence."""

    def write(features: list[tuple[str, dict, object]]) -> Path:
        path = tmp_path / "osm.geojsonseq"
        with path.open("w") as f:
            for osm_id, tags, geometry in features:
                feature = {
                    "type": "Feature",
                    "id": osm_id,
                    "geometry": mapping(geometry),
                    "properties": tags,
                }
                f.write(json.dumps(feature) + "\n")
        return path

    return write
