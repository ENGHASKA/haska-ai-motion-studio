# Installation

[English](INSTALL.md) · [العربية](../ar/INSTALL.md)

## Mandatory bootstrap tools

Install Git, Node.js 22+, npm, Python 3.10+, FFmpeg and FFprobe from trusted official or operating-system sources. HASKA does not elevate privileges or change system repositories, drivers or security policy.

Hardware minimum: 4 CPU cores, 8 GB RAM and 10 GB free SSD. Recommended: 8 cores, 16 GB RAM and 20 GB free SSD. A GPU is optional.

## Linux / Kali

```bash
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
cd haska-ai-motion-studio
./scripts/setup-linux.sh
./scripts/doctor-linux.sh
./run-studio.sh
```

The setup runs `npm ci` from the committed lockfile, creates local cache/output folders, and links `.claude/skills` to the project skills. It does not use `sudo`.

Optional local Python packages:

```bash
./scripts/setup-linux.sh --python-deps
```

Optional whisper.cpp requires a separate, consented download:

```bash
./scripts/setup-linux.sh --whisper
```

Blender is optional. Put a portable build under `tools/` or set `HASKA_BLENDER`; do not change graphics drivers for HASKA.

## Native Windows 10/11

Install Git for Windows, Node.js 22+, Python 3.10+ and FFmpeg. WinGet examples (review each package first):

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

Open a new PowerShell window:

```powershell
git clone --branch v0.1.0-beta.1 --depth 1 https://github.com/ENGHASKA/haska-ai-motion-studio.git
Set-Location haska-ai-motion-studio
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\doctor-windows.ps1
.\run-studio.ps1
```

The setup uses a project-local npm cache and creates a junction (or copy fallback) for Claude skills. `-PythonDeps` creates `.venv`. WSL2 is optional.

## Chromium and Remotion

The doctor accepts a supported local Chrome/Chromium/Edge or Remotion's project-local headless shell. The first render may need network access for Remotion to download that shell. Set `HASKA_BROWSER` to an existing executable if automatic discovery fails.

## Optional NVIDIA and Blender

`nvidia-smi` is detected read-only. No driver, CUDA, kernel, power-mode or OptiX change is made. Hosted CI does not prove GPU compatibility.

## Claude Code

Claude Code is optional and separate from HASKA. It needs an Anthropic account and network access:

```bash
npm install -g @anthropic-ai/claude-code
claude doctor
claude
```

Do not install it with sudo. The setup exposes the repository's `.agents/skills` through `.claude/skills`; commands are under `.claude/commands`.

## Updates

Back up uncommitted projects, then:

```bash
git fetch --tags origin
git switch --detach vNEXT
npm ci
npm run doctor
```

For a release archive, extract the new version to a new directory and copy only your own project folders/assets after reviewing licenses. Never overwrite a working installation blindly.
