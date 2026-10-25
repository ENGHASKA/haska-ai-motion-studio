#!/usr/bin/env bash
# HASKA AI Motion Studio: Linux setup. Never uses sudo, never installs globally, never downloads models unless asked.
#   scripts/setup-linux.sh [--python-deps] [--whisper] [--yes]
#     --python-deps  create ./.venv and install numpy, scipy, Pillow (small download)
#     --whisper      run scripts/install-whisper.sh (downloads whisper.cpp + a model; asks first unless --yes)
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"
PY_DEPS=0; WHISPER=0; YES=0
for arg in "$@"; do case "$arg" in --python-deps) PY_DEPS=1;; --whisper) WHISPER=1;; --yes) YES=1;; *) echo "unknown option: $arg"; exit 2;; esac; done

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. $2"; MISSING=1; }; }
MISSING=0
need node "Install Node.js >= 22 (https://nodejs.org or your package manager)."
need npm "Comes with Node.js."
need python3 "Install Python >= 3.10 (sudo apt install python3 python3-venv)."
need ffmpeg "Install FFmpeg (sudo apt install ffmpeg)."
need ffprobe "Comes with FFmpeg."
[ "$MISSING" = 0 ] || { echo "Install the missing tools yourself, then rerun. Nothing was changed."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || { echo "Node.js 22+ required (found $(node --version))."; exit 1; }
python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' || { echo "Python 3.10+ required (found $(python3 --version))."; exit 1; }

mkdir -p .cache/npm .cache/remotion out
export NPM_CONFIG_CACHE="$ROOT_DIR/.cache/npm"
echo "==> npm ci (project-local cache)"
if [ -f package-lock.json ]; then npm ci --include=dev --no-audit --no-fund; else npm install --include=dev --no-audit --no-fund; fi

if [ ! -e .claude/skills ]; then mkdir -p .claude && ln -s ../.agents/skills .claude/skills && echo "==> linked .claude/skills"; fi

if [ "$PY_DEPS" = 1 ]; then
  echo "==> .venv with numpy, scipy, Pillow"
  python3 -m venv .venv
  .venv/bin/python -m pip install --quiet --disable-pip-version-check numpy scipy Pillow
fi

if [ "$WHISPER" = 1 ]; then
  if [ "$YES" = 0 ]; then read -r -p "This downloads whisper.cpp sources and a model (hundreds of MB). Continue? [y/N] " a; [ "$a" = y ] || { echo "skipped whisper"; WHISPER=0; }; fi
  [ "$WHISPER" = 0 ] || ./scripts/install-whisper.sh
fi

echo "==> doctor"
scripts/doctor-linux.sh
echo "Done. Start the preview with: npm run studio   (http://localhost:3000)"
