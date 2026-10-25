#!/usr/bin/env python3
"""Build deterministic, audited source packages for Windows and Linux."""
from __future__ import annotations

import datetime
import gzip
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from package_lib import allowed, denied, home_path_findings, posix, scan_text, sha256
from verify_package import verify

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FIXED_EPOCH = 1767225600  # 2026-01-01 UTC


def run(command: list[str]) -> None:
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, check=True)


def tracked() -> list[str]:
    result = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, check=True, capture_output=True)
    return [posix(p) for p in result.stdout.decode().split("\0") if p]


def collect() -> list[tuple[str, bytes]]:
    entries: list[tuple[str, bytes]] = []
    findings: list[str] = []
    allowed_binary = {".ttf", ".otf"}
    for rel in tracked():
        path = ROOT / rel
        if path.is_symlink() or not path.is_file() or not allowed(rel, False):
            continue
        reason = denied(rel)
        if reason:
            findings.append(f"{rel}: forbidden ({reason})")
            continue
        body = path.read_bytes()
        findings += scan_text(rel, body)
        findings += home_path_findings(rel, body, allow_in=("tests/", "scripts/package_lib.py"))
        if b"\0" in body[:2048] and path.suffix.lower() not in allowed_binary and rel != "fixtures/cybersecurity-voice.wav":
            findings.append(f"{rel}: unexpected binary file")
        entries.append((rel, body))
    required = {
        "LICENSE", "README.md", "README.ar.md", "SECURITY.md", "THIRD_PARTY_NOTICES.md", "requirements-media.txt",
        "docs/en/INSTALL.md", "docs/ar/INSTALL.md", "scripts/setup-linux.sh",
        "scripts/setup-windows.ps1", ".agents/skills/haska-video/SKILL.md",
    }
    present = {rel for rel, _ in entries}
    findings += [f"{rel}: required release file missing" for rel in sorted(required - present)]
    if any(rel.startswith(("production/projects/", "production/approvals/", "public/audio-projects/reel-")) for rel in present):
        findings.append("private production data entered the release set")
    if "src/data/active-audio-project.json" in present:
        findings.append("active audio project may contain a private transcript")
    if findings:
        raise SystemExit("Release audit failed:\n  " + "\n  ".join(findings))
    return sorted(entries)


def manifest(name: str, platform: str, entries: list[tuple[str, bytes]]) -> bytes:
    value = {
        "schemaVersion": 1,
        "name": name,
        "version": json.loads((ROOT / "package.json").read_text())["version"],
        "platform": platform,
        "createdOn": datetime.date.today().isoformat(),
        "includesDependencies": False,
        "includesPersonalProjects": False,
        "files": [{"path": rel, "sha256": sha256(body), "bytes": len(body)} for rel, body in entries],
        "notes": "Source package only. No dependencies, media, models, credentials, private projects, caches or renders.",
    }
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def write_zip(target: Path, root: str, entries: list[tuple[str, bytes]], manifest_body: bytes) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for rel, body in entries + [("PACKAGE-MANIFEST.json", manifest_body)]:
            info = zipfile.ZipInfo(f"{root}/{rel}", date_time=(2026, 1, 1, 0, 0, 0))
            info.external_attr = (0o755 if rel.endswith((".sh", ".py", ".mjs")) else 0o644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, body)


def write_tar_gz(target: Path, root: str, entries: list[tuple[str, bytes]], manifest_body: bytes) -> None:
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for rel, body in entries + [("PACKAGE-MANIFEST.json", manifest_body)]:
            info = tarfile.TarInfo(f"{root}/{rel}")
            info.size = len(body)
            info.mode = 0o755 if rel.endswith((".sh", ".py", ".mjs")) else 0o644
            info.mtime = FIXED_EPOCH
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            archive.addfile(info, io.BytesIO(body))
    with target.open("wb") as output, gzip.GzipFile(filename="", mode="wb", fileobj=output, mtime=0) as compressed:
        compressed.write(raw.getvalue())


def extract_fresh(path: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="haska-release-check-") as tmp:
        destination = Path(tmp)
        if path.suffix == ".zip":
            with zipfile.ZipFile(path) as archive:
                members = [(i.filename, archive.read(i)) for i in archive.infolist() if not i.is_dir()]
        else:
            with tarfile.open(path, "r:gz") as archive:
                members = [(m.name, archive.extractfile(m).read()) for m in archive.getmembers() if m.isfile()]
        for name, body in members:
            parts = Path(name).parts
            if name.startswith(("/", "\\")) or ".." in parts:
                raise SystemExit(f"unsafe archive member: {name}")
            target = destination.joinpath(*parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        if not any(destination.rglob("PACKAGE-MANIFEST.json")):
            raise SystemExit(f"fresh extraction failed: {path.name}")


def main() -> int:
    npm = "npm.cmd" if os.name == "nt" else "npm"
    python = sys.executable
    run([npm, "run", "typecheck"])
    run([npm, "run", "test:production"])
    run([python, "-m", "unittest", "discover", "-s", "tests/python", "-v"])
    run([npm, "run", "smoke:majed"])
    entries = collect()
    version = json.loads((ROOT / "package.json").read_text())["version"]
    root = f"haska-ai-motion-studio-{version}"
    DIST.mkdir(exist_ok=True)
    targets = [
        (DIST / f"{root}-windows-source.zip", "windows"),
        (DIST / f"{root}-linux-source.tar.gz", "linux"),
    ]
    for target, platform in targets:
        body = manifest(root, platform, entries)
        if target.suffix == ".zip":
            write_zip(target, root, entries, body)
        else:
            write_tar_gz(target, root, entries, body)
        digest = sha256(target.read_bytes())
        target.with_name(target.name + ".sha256").write_text(f"{digest}  {target.name}\n")
        errors = verify(target, None)
        if errors:
            raise SystemExit("Archive verification failed:\n  " + "\n  ".join(errors))
        extract_fresh(target)
        print(f"OK {target.name} {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
