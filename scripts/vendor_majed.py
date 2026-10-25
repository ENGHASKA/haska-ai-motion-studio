#!/usr/bin/env python3
"""Vendor the audited, allow-listed subset of majedphotos/video-ad-editor (MIT) into third_party/majed-video/.

Nothing from the upstream repository is executed. Use a source tree extracted from the *pinned* archive:

    curl -fL -o vae.tar.gz https://codeload.github.com/majedphotos/video-ad-editor/tar.gz/<COMMIT>
    sha256sum vae.tar.gz                       # compare with third_party/majed-video/UPSTREAM.json
    mkdir vae && tar -xzf vae.tar.gz -C vae --strip-components=1
    python3 -I scripts/vendor_majed.py --source vae --commit <COMMIT> --archive-sha256 <HASH>

The allow-list below is deliberate: text, data and reference code only. The upstream skill instructions
(SKILL.md) are NOT vendored because they carry promotional instructions and an auto-update path that HASKA
does not follow. HASKA's own skills (.agents/skills/haska-video) replace them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "third_party" / "majed-video"
FONT_DEST = ROOT / "public" / "fonts" / "majed"

# (source path relative to the repo, destination relative to third_party/majed-video)
COPY = [
    ("LICENSE", "LICENSE"),
    ("video-ad-editor/motion/moves.js", "motion/moves.js"),
    ("video-ad-editor/motion/styles.js", "motion/styles.js"),
    ("video-ad-editor/motion/engine.js", "motion/engine.js"),
    ("video-ad-editor/motion/ENGINE-API.md", "motion/ENGINE-API.md"),
    ("video-ad-editor/motion/moves/catalog.json", "motion/moves/catalog.json"),
    ("video-ad-editor/motion/moves/CREDITS.md", "motion/moves/CREDITS.md"),
    ("video-ad-editor/motion/styles/catalog.json", "motion/styles/catalog.json"),
    ("video-ad-editor/motion/examples/one-take/project.json", "motion/examples/one-take/project.json"),
    ("video-ad-editor/motion/examples/one-take/scenes/s1.js", "motion/examples/one-take/scenes/s1.js"),
]
# Reference documents (Arabic), loaded on demand. Excluded: promotional affiliate page.
EXCLUDE_REFERENCES = {"keyword-automation.md"}
SWIFT_SOURCES = ["personmask.swift", "facetrack.swift", "handpose.swift", "hdr2sdr.swift"]  # macOS-only, reference only
# Fonts the moves use (all SIL OFL). IBM Plex Sans Arabic is already in public/fonts/ibm-plex-sans-arabic.
FONTS = [
    "AmiriQuran-Regular.ttf", "ArefRuqaa-Bold.ttf", "ArefRuqaa-Regular.ttf", "Cairo-VF.ttf", "Inter-VF.ttf",
    "Lalezar-Regular.ttf", "NotoKufiArabic-VF.ttf", "ReadexPro-VF.ttf", "Tajawal-Black.ttf", "Tajawal-Bold.ttf", "Tajawal-Regular.ttf",
]
EXCLUDED_WHY = {
    "**/SKILL.md": "skill instructions embed a promotional footer and an auto-update path; replaced by HASKA skills",
    "references/keyword-automation.md": "affiliate/referral promotion",
    "video-ad-editor/scripts/00_setup.sh": "silent GitHub update check + rsync --delete self-overwrite + sudo/curl installers",
    "video-ad-editor/studio/**": "local Python HTTP server and share page; replaced by Remotion Studio",
    "video-ad-editor/motion/moves/previews/**": "100 rendered preview videos (14 MB), not needed",
    "video-ad-editor/motion/vendor/**": "vendored three.js; HASKA already depends on three",
    "_pkg/**, *.gif, *.skill": "marketing images and a packaged zip",
    "video-ad-editor/onboarding/**": "onboarding page with promotion",
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_one(source: Path, relative: str, target: Path, record: list[dict]) -> None:
    src = source / relative
    if not src.is_file():
        raise SystemExit(f"missing upstream file: {relative}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(src, target)
    record.append({"upstream": relative, "path": str(target.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(src), "bytes": src.stat().st_size})


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--archive-sha256", required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    if not (source / "video-ad-editor" / "VERSION").is_file():
        raise SystemExit("--source does not look like a video-ad-editor checkout")

    record: list[dict] = []
    for relative, target in COPY:
        copy_one(source, relative, DEST / target, record)
    for path in sorted((source / "video-ad-editor" / "references").glob("*.md")):
        if path.name not in EXCLUDE_REFERENCES:
            copy_one(source, f"video-ad-editor/references/{path.name}", DEST / "references" / path.name, record)
    for name in SWIFT_SOURCES:
        copy_one(source, f"video-ad-editor/scripts/{name}", DEST / "macos" / name, record)
    for name in FONTS:
        copy_one(source, f"video-ad-editor/motion/fonts/{name}", FONT_DEST / name, record)
    copy_one(source, "video-ad-editor/motion/fonts/LICENSES.txt", FONT_DEST / "LICENSES.txt", record)

    inventory = sorted(str(p.relative_to(source)).replace("\\", "/") for p in source.rglob("*") if p.is_file())
    manifest = {
        "schemaVersion": 1,
        "upstream": {
            "repository": "https://github.com/majedphotos/video-ad-editor",
            "license": "MIT (Copyright (c) 2026 Majed Alzaabi)",
            "version": (source / "video-ad-editor" / "VERSION").read_text().strip(),
            "commit": args.commit,
            "archiveSha256": args.archive_sha256,
        },
        "relatedRepositories": [
            {"repository": "https://github.com/majedphotos/majed-plugins", "commit": "22ae9594fde716178602fae728a9d73a3b56406d", "license": "none at repository root; MIT only inside script/ and live-stage/", "vendored": False},
            {"repository": "https://github.com/majedphotos/majed-davinci", "commit": "331ea9db729e636c2fc80e1450552b7994a9afb3", "license": "MIT", "vendored": False, "why": "drives DaVinci Resolve Studio 21.1 (macOS) through its scripting API; cannot run here"},
        ],
        "inspectedFiles": len(inventory),
        "vendoredFiles": len(record),
        "excluded": EXCLUDED_WHY,
        "autoUpdate": "disabled: nothing from upstream is installed as a plugin and its update script is never run",
        "files": record,
    }
    (DEST / "UPSTREAM.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"vendored {len(record)} files of {len(inventory)} inspected -> {DEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
