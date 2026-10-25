#!/usr/bin/env python3
"""Verify a portable package: integrity, completeness and that nothing private slipped in.

    python3 scripts/verify_package.py PACKAGE.zip [--sha256-file PACKAGE.zip.sha256]
Exit 0 only if every check passes. Works on Linux and Windows (standard library only).
"""
from __future__ import annotations

import argparse
import json
import stat
import sys
import tarfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from package_lib import denied, home_path_findings, scan_text, sha256  # noqa: E402


def verify(path: Path, sums: Path | None, expect_personal: bool | None = None) -> list[str]:
    errors: list[str] = []
    data = path.read_bytes()
    sibling = sums or path.with_name(path.name + ".sha256")
    if sibling.is_file():
        want = sibling.read_text().split()[0]
        if sha256(data) != want:
            errors.append(f"{'zip' if path.suffix == '.zip' else 'archive'} checksum does not match the .sha256 file")
    else:
        errors.append("no .sha256 file to check the zip against")
    symlinks: list[str] = []
    bodies: dict[str, bytes] = {}
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue
                bodies[info.filename] = archive.read(info)
                if stat.S_ISLNK(info.external_attr >> 16):
                    symlinks.append(info.filename)
    elif path.name.endswith(".tar.gz"):
        with tarfile.open(path, "r:gz") as archive:
            for info in archive.getmembers():
                if info.issym() or info.islnk():
                    symlinks.append(info.name)
                elif info.isfile():
                    stream = archive.extractfile(info)
                    if stream is not None:
                        bodies[info.name] = stream.read()
    else:
        return errors + ["unsupported archive format"]
    names = list(bodies)
    if not names:
        return errors + ["archive is empty"]
    roots = {n.split("/")[0] for n in names}
    if len(roots) != 1 or any(n.startswith(("/", "\\")) or ".." in Path(n).parts for n in names):
        return errors + ["archive paths are unsafe or do not share one root"]
    root = next(iter(roots))
    manifest_name = f"{root}/PACKAGE-MANIFEST.json"
    if manifest_name not in names:
        return errors + ["PACKAGE-MANIFEST.json is missing"]
    manifest = json.loads(bodies[manifest_name])
    listed = {f["path"]: f for f in manifest["files"]}
    actual = {n[len(root) + 1:]: n for n in names if n != manifest_name}
    errors += [f"missing from archive: {p}" for p in sorted(set(listed) - set(actual))]
    errors += [f"not in manifest: {p}" for p in sorted(set(actual) - set(listed))]
    for rel, member in actual.items():
        body = bodies[member]
        if rel in listed and sha256(body) != listed[rel]["sha256"]:
            errors.append(f"hash mismatch: {rel}")
        reason = denied(rel)
        if reason:
            errors.append(f"forbidden file: {rel} ({reason})")
        errors += scan_text(rel, body) + home_path_findings(rel, body, allow_in=())
    errors += [f"symlink entry: {name}" for name in symlinks]
    if expect_personal is not None and manifest["includesPersonalProjects"] != expect_personal:
        errors.append("personal-project flag differs from what was requested")
    if not manifest["includesPersonalProjects"] and any(p.startswith(("public/audio-projects/reel-", "production/approvals/", "production/projects/")) for p in actual):
        errors.append("personal project files present in a package that says it has none")
    if "src/data/active-audio-project.json" in actual:
        errors.append("private-capable active audio snapshot present")
    required_files = (
        ("LICENSE", "README.md", "README.ar.md", "package.json", "THIRD_PARTY_NOTICES.md",
         "third_party/majed-video/LICENSE", "scripts/setup-linux.sh", "scripts/setup-windows.ps1",
         "docs/en/INSTALL.md", "docs/ar/INSTALL.md")
        if manifest.get("schemaVersion") == 1
        else ("package.json", "THIRD_PARTY_NOTICES.md", "third_party/majed-video/LICENSE",
              "scripts/setup-linux.sh", "scripts/setup-windows.ps1", "docs/INSTALL-ar.md")
    )
    for required in required_files:
        if required not in actual:
            errors.append(f"required file missing: {required}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("package", type=Path)
    parser.add_argument("--sha256-file", type=Path)
    args = parser.parse_args()
    errors = verify(args.package, args.sha256_file)
    if errors:
        print("VERIFY FAILED\n  " + "\n  ".join(errors))
        return 1
    print("VERIFY OK: checksum, manifest hashes, no forbidden files, no credentials, no machine paths")
    return 0


if __name__ == "__main__":
    sys.exit(main())
