#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd -- "$SCRIPT_DIR/../../.." && pwd)
CONFIG_PATH="$PROJECT_ROOT/.lorex/config.json"
INDEX_PATH="$PROJECT_ROOT/.lorex/index.sqlite"
MANIFEST_PATH="$PROJECT_ROOT/.lorex/manifest.json"
DEFAULT_FOLDERS="docs,swarm-report,frontend/src/components/chat/pipeline"

require_lorex() {
  if ! command -v lorex >/dev/null 2>&1; then
    printf 'lorex is not installed or not available in PATH\n' >&2
    exit 1
  fi
}

ensure_config() {
  if [ -f "$CONFIG_PATH" ]; then
    return
  fi

  lorex init --project-root "$PROJECT_ROOT" --folders "$DEFAULT_FOLDERS"
}

ensure_index() {
  if [ -f "$INDEX_PATH" ] && [ -f "$MANIFEST_PATH" ]; then
    return
  fi

  lorex index --project-root "$PROJECT_ROOT"
}

main() {
  if [ "$#" -eq 0 ]; then
    printf 'Usage: %s "question"\n' "$0" >&2
    exit 1
  fi

  require_lorex

  cd "$PROJECT_ROOT"
  lorex auth status >/dev/null
  ensure_config
  ensure_index

  lorex query "$*" --project-root "$PROJECT_ROOT" --format markdown --max-chunks 8
}

main "$@"
