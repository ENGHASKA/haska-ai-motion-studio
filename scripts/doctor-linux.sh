#!/usr/bin/env bash
# Linux environment check. Read-only. Usage: scripts/doctor-linux.sh [--json]
set -u
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$ROOT_DIR"
if ! command -v node >/dev/null 2>&1; then echo "FAIL  node is not installed (need Node.js >= 22)"; exit 1; fi
node scripts/doctor.mjs "$@"
status=$?
if [ "${1:-}" != "--json" ]; then
  if command -v fc-list >/dev/null 2>&1; then echo "PASS  fontconfig present (used only for optional system-font QA)"; else echo "WARN  fontconfig (fc-list) missing: system-font QA is skipped; bundled fonts still work"; fi
  if [ -r /proc/version ] && grep -qi microsoft /proc/version; then echo "WARN  running inside WSL: use the Windows setup for a native Windows install; GPU rendering needs the WSL NVIDIA driver"; fi
fi
exit $status
