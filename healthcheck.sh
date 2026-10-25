#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
failures=0
warnings=0

pass() { printf 'PASS  %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$1"; failures=$((failures + 1)); }

check_command() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    pass "$command_name: $(command -v "$command_name")"
  else
    fail "$command_name is not installed"
  fi
}

printf 'AI Motion Studio health check\nProject: %s\n\n' "$ROOT_DIR"

for tool in git node npm python3 ffmpeg ffprobe; do
  check_command "$tool"
done

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf 0)"
if (( node_major >= 22 )); then pass "Node.js $(node --version) is supported"; else fail "Node.js 22+ is required"; fi

if [[ -x "$ROOT_DIR/node_modules/.bin/remotion" ]]; then
  pass "$($ROOT_DIR/node_modules/.bin/remotion --version 2>/dev/null | head -n 1)"
else
  fail "project dependencies are not installed"
fi

if nvidia-smi >/dev/null 2>&1; then
  gpu="$(nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null | head -n 1)"
  pass "NVIDIA GPU: $gpu"
else
  warn "nvidia-smi unavailable (expected inside restricted sandboxes)"
fi

if command -v glxinfo >/dev/null 2>&1 && renderer="$(glxinfo -B 2>/dev/null | awk -F': ' '/OpenGL renderer string/ {print $2; exit}')" && [[ -n "$renderer" ]]; then
  pass "OpenGL renderer: $renderer"
else
  warn "OpenGL renderer could not be queried"
fi

blender_bin="$ROOT_DIR/blender-studio.sh"
if [[ -x "$blender_bin" ]]; then
  pass "$($blender_bin --version | head -n 1)"
else
  warn "portable Blender launcher is not installed at blender-studio.sh"
fi

if [[ -d "$ROOT_DIR/.agents/skills" ]]; then
  skill_count="$(find "$ROOT_DIR/.agents/skills" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  pass "$skill_count project agent skill directories found"
else
  warn "project agent skills are not installed"
fi

if [[ -x "$ROOT_DIR/tools/whisper-cli" && -s "$ROOT_DIR/tools/whisper-models/ggml-small.bin" ]]; then
  pass "project-local whisper.cpp and multilingual small model"
else
  warn "Audio-to-Motion transcription is not installed; run ./scripts/install-whisper.sh"
fi

if [[ -x "$ROOT_DIR/scripts/audio_motion.py" ]]; then
  pass "Audio-to-Motion CLI"
else
  fail "Audio-to-Motion CLI is missing"
fi

if [[ -x "$ROOT_DIR/node_modules/.bin/tsc" ]]; then
  if "$ROOT_DIR/node_modules/.bin/tsc" --noEmit --pretty false >/dev/null; then
    pass "TypeScript compilation"
  else
    fail "TypeScript compilation"
  fi
fi

printf '\nResult: %d failure(s), %d warning(s)\n' "$failures" "$warnings"
(( failures == 0 ))
