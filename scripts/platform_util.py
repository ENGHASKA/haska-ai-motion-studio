"""Platform adapter for HASKA's Python tools (Linux, Windows, macOS). Mirror of scripts/lib/platform.mjs.

No machine-specific paths: tools are found by override (HASKA_* env or haska.config.json), the project-local tools/
folder, then PATH. Windows executables get the .exe suffix automatically.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(os.environ.get("HASKA_PROJECT_ROOT") or Path(__file__).resolve().parent.parent)
IS_WINDOWS = sys.platform.startswith("win")
NODE = shutil.which("node") or "node"


def local_config() -> dict:
    try:
        return json.loads((ROOT / "haska.config.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def exe_name(name: str) -> str:
    return f"{name}.exe" if IS_WINDOWS and not name.lower().endswith((".exe", ".cmd", ".bat")) else name


def find_tool(name: str, env_var: str | None = None) -> Path:
    """Resolve a tool to a path. Returns the project-local location when nothing is found, so messages can name it."""
    override = (os.environ.get(env_var) if env_var else None) or local_config().get("tools", {}).get(name)
    if override and Path(override).exists():
        return Path(override)
    local = ROOT / "tools" / exe_name(name)
    if local.exists():
        return local
    found = shutil.which(name)
    return Path(found) if found else local


def tool_command(name: str, env_var: str | None = None) -> str:
    """Command string for subprocess: absolute path when resolvable, else the bare name (lets the OS report 'not found')."""
    path = find_tool(name, env_var)
    return str(path) if path.exists() else name


FFMPEG = tool_command("ffmpeg", "HASKA_FFMPEG")
FFPROBE = tool_command("ffprobe", "HASKA_FFPROBE")


def nvidia_available() -> bool:
    smi = shutil.which("nvidia-smi")
    if not smi:
        return False
    return subprocess.run([smi], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20).returncode == 0


def is_executable(path: Path) -> bool:
    return path.is_file() and (IS_WINDOWS or os.access(path, os.X_OK))
