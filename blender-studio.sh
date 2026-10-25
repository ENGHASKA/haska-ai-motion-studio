#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
OPTIX_LIB_DIR="$ROOT_DIR/tools/nvidia-optix/usr/lib/x86_64-linux-gnu/nvidia/current"

if [[ ! -x "$ROOT_DIR/tools/blender/blender" ]]; then
  echo "Portable Blender is missing from tools/blender." >&2
  exit 1
fi

if [[ -d "$OPTIX_LIB_DIR" ]]; then
  export LD_LIBRARY_PATH="$OPTIX_LIB_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

exec "$ROOT_DIR/tools/blender/blender" "$@"
