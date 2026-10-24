"""The data contract, the committed schema and the committed fixtures must agree."""

import pytest
from pydantic import ValidationError

from compiler.models import (
    Band,
    Coordinate,
    Habitat,
    PillarScoring,
    ScoringConfig,
    SignalId,
    Spot,
    WaterType,
    WaterTypeScoring,
)
from compiler.paths import FIXTURES_DIR, SCHEMA_FILE, SCORING_CONFIG_FILE
from compiler.publish.layout import read_catalogue, write_catalogue
from compiler.schema import render_schema


def test_committed_schema_is_current() -> None:
    assert SCHEMA_FILE.read_text() == render_schema(), "run `uv run threex-compile schema`"


def test_committed_fixtures_are_valid() -> None:
    catalogue = read_catalogue(FIXTURES_DIR)
    water_types = {spot.water_type for tile in catalogue.tiles for spot in tile.spots}
    assert water_types == set(WaterType)


def test_scoring_config_is_valid_and_matches_fixture() -> None:
    config = ScoringConfig.model_validate_json(SCORING_CONFIG_FILE.read_bytes())
    assert read_catalogue(FIXTURES_DIR).scoring == config


def test_round_trip(tmp_path) -> None:
    catalogue = read_catalogue(FIXTURES_DIR)
    write_catalogue(catalogue, tmp_path)
    assert read_catalogue(tmp_path) == catalogue


def test_tampered_tile_is_rejected(tmp_path) -> None:
    manifest = write_catalogue(read_catalogue(FIXTURES_DIR), tmp_path)
    tile_file = tmp_path / "v1" / manifest.tiles[0].path
    tile_file.write_bytes(tile_file.read_bytes().replace(b"Fort Kochi", b"Fort Kochl"))
    with pytest.raises(ValueError, match="sha256"):
        read_catalogue(tmp_path)


def _spot(**overrides) -> Spot:
    fields = {
        "id": "sp-test",
        "name": "Test",
        "coordinate": Coordinate(lat=10, lon=76),
        "water_type": WaterType.COASTAL,
        "features": [],
        "habitat": Habitat(),
        "tide_cluster_id": "tc-test",
        "confidence": 0.5,
        "sources": ["osm"],
    }
    return Spot(**(fields | overrides))


def test_tidal_spots_need_a_tide_series_and_freshwater_spots_must_not_have_one() -> None:
    with pytest.raises(ValidationError, match="needs a tide_cluster_id"):
        _spot(tide_cluster_id=None)
    with pytest.raises(ValidationError, match="must not have a tide_cluster_id"):
        _spot(water_type=WaterType.FRESHWATER)


def test_pillars_reject_signals_from_other_pillars() -> None:
    band = Band(weight=1, ideal_min=0, ideal_max=1, falloff=0)
    pillar = PillarScoring(threshold=0.5, min_coverage=0.5, signals={SignalId.LIGHT_LEVEL: band})
    stray = PillarScoring(threshold=0.5, min_coverage=0.5, signals={SignalId.SOLUNAR: band})
    with pytest.raises(ValidationError, match="comfort cannot use signals: solunar"):
        WaterTypeScoring(comfort=stray, safety=pillar, food=pillar)


def test_json_uses_camel_case() -> None:
    spot = _spot(access_distance_m=10)
    data = spot.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert {"waterType", "accessDistanceM", "tideClusterId"} <= data.keys()
