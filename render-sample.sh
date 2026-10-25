#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
OUTPUT="${1:-$ROOT_DIR/out/cybersecurity-intro.mp4}"
cd "$ROOT_DIR"

if [[ ! -x node_modules/.bin/remotion ]]; then
  echo "Dependencies are missing. Run: npm install"
  exit 1
fi

mkdir -p "$(dirname -- "$OUTPUT")" .cache/npm .cache/remotion
export NPM_CONFIG_CACHE="$ROOT_DIR/.cache/npm"

encoding_args=(--crf=18 --hardware-acceleration=disable)
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then
  encoding_args=(--video-bitrate=12M --hardware-acceleration=if-possible)
fi

node_modules/.bin/remotion render src/index.ts CybersecurityIntro "$OUTPUT" \
  --codec=h264 \
  --color-space=bt709 \
  "${encoding_args[@]}" \
  --concurrency=50%

test -s "$OUTPUT"
duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUTPUT")"
dimensions="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$OUTPUT")"

awk -v value="$duration" 'BEGIN {if (value < 4.95 || value > 5.05) exit 1}'
[[ "$dimensions" == "1920x1080" ]]

echo "Verified MP4: $OUTPUT"
echo "Duration: ${duration}s; resolution: $dimensions"
