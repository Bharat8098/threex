#!/bin/bash
# Installs dependencies so tests, linters and type checks work in Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Node workspaces (@threex/core, later apps/web). `npm install` reuses the cached container state.
npm install --no-audit --no-fund

# Python pipeline: creates pipeline/.venv from uv.lock.
(cd pipeline && uv sync)

# osmium-tool clips and filters OpenStreetMap extracts for `threex-compile build`.
if ! command -v osmium >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq osmium-tool
fi
