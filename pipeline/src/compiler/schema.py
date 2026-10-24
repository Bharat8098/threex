"""Export the data contract as one JSON Schema bundle."""

import json
from typing import Any

from pydantic.json_schema import models_json_schema

from compiler.models import SCHEMA_VERSION, Manifest, ScoringConfig, Tile

SCHEMA_ID = f"urn:threex:schema:v{SCHEMA_VERSION}"


def build_schema() -> dict[str, Any]:
    _, bundle = models_json_schema(
        [(Manifest, "validation"), (Tile, "validation"), (ScoringConfig, "validation")],
        by_alias=True,
        title=f"ThreeX data contract v{SCHEMA_VERSION}",
        description=(
            "Generated from pipeline/src/compiler/models.py; do not edit by hand. "
            "Documents validate against #/$defs/Manifest, #/$defs/Tile or #/$defs/ScoringConfig."
        ),
    )
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": SCHEMA_ID,
        **bundle,
    }


def render_schema() -> str:
    return json.dumps(build_schema(), indent=2, ensure_ascii=False) + "\n"
