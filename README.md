# HASKA AI Motion Studio

[English](README.md) · [العربية](README.ar.md)

[![CI](https://github.com/ENGHASKA/haska-ai-motion-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/ENGHASKA/haska-ai-motion-studio/actions/workflows/ci.yml)
![Node 22+](https://img.shields.io/badge/Node.js-22%2B-339933)
![License: MIT](https://img.shields.io/badge/project%20code-MIT-blue)

HASKA AI Motion Studio is a local-first, bilingual motion-graphics workspace. It combines Remotion, React, TypeScript, GSAP, Three.js, React Three Fiber, FFmpeg and optional Blender/whisper.cpp tooling. It turns text briefs or reviewed narration transcripts into deterministic previews and renders; every animation is derived from the Remotion frame clock.

This is an early public beta. Linux/Kali is locally tested. Native Windows is covered by CI and PowerShell tooling but still requires real-machine media, Chromium and GPU testing.

## What is included

| Area | Capability |
| --- | --- |
| Production | ShotGraph, Style Profiles, Asset Catalog, QA and approval gates |
| Motion | reusable typography, transitions, motion presets, GSAP frame-seeked helpers |
| 3D | Three.js / React Three Fiber / Rapier; optional offline Blender shots |
| Narration | Audio-to-Motion, transcript/storyboard review, RTL/LTR captions |
| Editing | talking-head cut plans, montage timing, covers, text-behind-subject, EDL/OTIO handoff |
| Assistant | project-scoped Claude Code commands and skills |
| Packaging | audited Windows ZIP and Linux tar.gz with manifests and SHA-256 files |

## Requirements

- Git, Node.js 22+, npm, Python 3.10+, FFmpeg and FFprobe.
- Minimum: modern 4-core x64/arm64 CPU, 8 GB RAM and 10 GB free SSD space.
- Recommended: 8-core CPU, 16 GB RAM, 20 GB free SSD space and a supported GPU.
- NVIDIA, Blender and whisper.cpp are optional. Installers never modify GPU drivers, kernels, GRUB or global security settings.
- The first Remotion render may download a compatible headless Chromium shell if no supported local browser is found.

## Install

Inspect the checkout before running its local installer.

### Linux / Kali

```bash
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
cd haska-ai-motion-studio
./scripts/setup-linux.sh
./run-studio.sh
```

Optional local Python media packages: `./scripts/setup-linux.sh --python-deps`.

### Windows 10/11 (native PowerShell)

```powershell
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
Set-Location haska-ai-motion-studio
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
.\run-studio.ps1
```

The per-process execution-policy option does not change the machine policy. WSL2 is optional, not required. Open <http://localhost:3000>; the launcher forces loopback access.

## First video

```bash
npm run production -- new hello --title "Hello HASKA" --platform youtube --language en --style haska-cyber
npm run production -- validate hello
npm run production -- qa hello
npm run production -- preview hello
```

Edit `production/projects/hello/brief.md` and `shot-graph.json`. Rendering is intentionally approval-gated; see [Quick Start](docs/en/QUICK_START.md).

With Claude Code (optional, requires an Anthropic account and network access):

```bash
npm install -g @anthropic-ai/claude-code
claude doctor
claude
```

Then use `/create-video <brief>` or, after importing narration, `/audio-to-motion <project-id>`. Do not use `sudo npm install -g`. HASKA itself requires no paid API; Claude Code licensing/account costs are separate.

## Documentation

- [Installation](docs/en/INSTALL.md) · [Quick start](docs/en/QUICK_START.md)
- [Features and architecture](docs/en/FEATURES.md)
- [Troubleshooting](docs/en/TROUBLESHOOTING.md) · [Development](docs/en/DEVELOPMENT.md)
- [Licensing](docs/en/LICENSING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Compatibility status

| Target | Status |
| --- | --- |
| Kali/Linux x64 | locally verified: install checks, TypeScript, production/Python tests, package verification |
| Ubuntu GitHub runner | CI configured; status is authoritative only after the workflow passes |
| Windows GitHub runner | CI configured; no GPU/Blender/native media guarantee |
| Windows 10/11 hardware | requires community testing |
| NVIDIA / OptiX / Blender GPU | optional and not verified by hosted CI |

## Security, bugs and contributions

Read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Use GitHub issues for reproducible bugs and [CONTRIBUTING.md](CONTRIBUTING.md) for code or skill contributions. Never attach private narration, source footage, credentials or client projects to a public issue.

## License

Original HASKA project code in this public snapshot is MIT licensed. Vendored Majed code, fonts, Remotion, GSAP and other dependencies retain their own licenses and terms. Remotion is not MIT and may require a paid company license depending on organization size and use. Read [docs/en/LICENSING.md](docs/en/LICENSING.md) before commercial use.
