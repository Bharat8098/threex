"""Well-known locations inside the monorepo."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_FILE = REPO_ROOT / "schema" / "v1" / "threex.schema.json"
SCORING_CONFIG_FILE = REPO_ROOT / "config" / "scoring-config.json"
FIXTURES_DIR = REPO_ROOT / "fixtures"
