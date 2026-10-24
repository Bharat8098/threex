"""Where fetched inputs live. Override with THREEX_CACHE (CI points it at a cached directory)."""

import os
from pathlib import Path

from compiler.paths import REPO_ROOT


def cache_dir() -> Path:
    return Path(os.environ.get("THREEX_CACHE", REPO_ROOT / "pipeline" / ".cache"))
