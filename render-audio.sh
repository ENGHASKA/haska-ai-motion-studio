#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ID="${1:?Usage: ./render-audio.sh PROJECT_ID [youtube|reel|tiktok] [OUTPUT.mp4]}"
PRESET="${2:-youtube}"
OUTPUT="${3:-}"

args=(render "$PROJECT_ID" --preset "$PRESET")
if [[ -n "$OUTPUT" ]]; then args+=(--output "$OUTPUT"); fi
exec python3 "$ROOT_DIR/scripts/audio_motion.py" "${args[@]}"
