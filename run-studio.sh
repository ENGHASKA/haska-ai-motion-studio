#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$ROOT_DIR"

if [[ ! -f node_modules/@remotion/cli/remotion-cli.js ]]; then
  echo "Dependencies are missing. Run: npm ci"
  exit 1
fi

exec node scripts/studio.mjs "$@"
