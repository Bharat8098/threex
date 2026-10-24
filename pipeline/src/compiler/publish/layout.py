"""The on-disk layout the app downloads, rooted at `<out>/v1/`.

    v1/manifest.json                    fetched first, revalidated on every launch
    v1/tiles/<geohash4>.<hash12>.json   immutable, cached forever
    v1/scoring/<hash12>.json            immutable, cached forever

Content-hashed names make a publish atomic: a new manifest points at new files, and an old
manifest still points at files that exist until the next publish replaces the directory.
"""

import hashlib
import json
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pydantic import BaseModel

from compiler.models import (
    SCHEMA_VERSION,
    Attribution,
    Manifest,
    Region,
    ScoringConfig,
    ScoringRef,
    Tile,
    TileRef,
)

VERSION_DIR = f"v{SCHEMA_VERSION}"


def to_json_bytes(model: BaseModel, *, pretty: bool) -> bytes:
    data = model.model_dump(mode="json", by_alias=True, exclude_none=True)
    if pretty:
        text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    else:
        text = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    return text.encode()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class Catalogue:
    data_version: str
    region: Region
    generated_at: datetime
    valid_until: datetime
    tiles: list[Tile]
    scoring: ScoringConfig
    attributions: list[Attribution]


def write_catalogue(catalogue: Catalogue, out_dir: Path, *, pretty: bool = False) -> Manifest:
    """Replace `<out_dir>/v1` with the catalogue and return the manifest written."""
    root = out_dir / VERSION_DIR
    if root.exists():
        shutil.rmtree(root)
    (root / "tiles").mkdir(parents=True)
    (root / "scoring").mkdir()

    tile_refs: list[TileRef] = []
    for tile in sorted(catalogue.tiles, key=lambda t: t.geohash):
        data = to_json_bytes(tile, pretty=pretty)
        digest = sha256(data)
        path = f"tiles/{tile.geohash}.{digest[:12]}.json"
        (root / path).write_bytes(data)
        tile_refs.append(
            TileRef(geohash=tile.geohash, path=path, sha256=digest, spot_count=len(tile.spots))
        )

    scoring_data = to_json_bytes(catalogue.scoring, pretty=pretty)
    scoring_digest = sha256(scoring_data)
    scoring_path = f"scoring/{scoring_digest[:12]}.json"
    (root / scoring_path).write_bytes(scoring_data)

    manifest = Manifest(
        schema_version=SCHEMA_VERSION,
        data_version=catalogue.data_version,
        region=catalogue.region,
        generated_at=catalogue.generated_at,
        valid_until=catalogue.valid_until,
        tiles=tile_refs,
        scoring=ScoringRef(
            path=scoring_path, sha256=scoring_digest, version=catalogue.scoring.version
        ),
        attributions=catalogue.attributions,
    )
    (root / "manifest.json").write_bytes(to_json_bytes(manifest, pretty=pretty))
    return manifest


def read_catalogue(out_dir: Path) -> Catalogue:
    """Load a published catalogue, checking hashes and cross-file references."""
    root = out_dir / VERSION_DIR
    manifest = Manifest.model_validate_json((root / "manifest.json").read_bytes())

    attribution_ids = {a.id for a in manifest.attributions}
    tiles: list[Tile] = []
    for ref in manifest.tiles:
        data = (root / ref.path).read_bytes()
        if sha256(data) != ref.sha256:
            raise ValueError(f"{ref.path}: sha256 does not match the manifest")
        tile = Tile.model_validate_json(data)
        if tile.geohash != ref.geohash:
            raise ValueError(f"{ref.path}: tile geohash {tile.geohash} != {ref.geohash}")
        if tile.data_version != manifest.data_version:
            raise ValueError(f"{ref.path}: data version differs from the manifest")
        if len(tile.spots) != ref.spot_count:
            raise ValueError(f"{ref.path}: spot count differs from the manifest")
        for spot in tile.spots:
            used = set(spot.sources) | {f.source for f in spot.features}
            unknown = used - attribution_ids
            if unknown:
                raise ValueError(f"spot {spot.id}: unknown attribution ids {sorted(unknown)}")
        tiles.append(tile)

    scoring_data = (root / manifest.scoring.path).read_bytes()
    if sha256(scoring_data) != manifest.scoring.sha256:
        raise ValueError(f"{manifest.scoring.path}: sha256 does not match the manifest")
    scoring = ScoringConfig.model_validate_json(scoring_data)

    return Catalogue(
        data_version=manifest.data_version,
        region=manifest.region,
        generated_at=manifest.generated_at,
        valid_until=manifest.valid_until,
        tiles=tiles,
        scoring=scoring,
        attributions=list(manifest.attributions),
    )
