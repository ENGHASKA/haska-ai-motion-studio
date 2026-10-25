# Troubleshooting

[English](TROUBLESHOOTING.md) · [العربية](../ar/TROUBLESHOOTING.md)

Start with `npm run doctor` (or the platform doctor script). It is read-only.

## Node or npm fails

Use Node.js 22+ and run `npm ci`, not `npm install`, for the locked dependency set. Remove no lockfile. A corporate proxy must trust npm and Remotion download endpoints.

## FFmpeg or FFprobe not found

Install both from the same trusted distribution or set `HASKA_FFMPEG` and `HASKA_FFPROBE` to absolute executable paths in your shell or ignored `haska.config.json`.

## Blank or failed Studio preview

Run `npm run typecheck`, inspect terminal output, then try `npm run compositions`. Empty-input editing compositions intentionally show labeled placeholders; the default public audio sample contains no bundled narration audio.

## Chromium download fails

Install Chrome/Chromium/Edge locally and set `HASKA_BROWSER`. Do not disable antivirus or browser sandboxing globally.

## Windows path errors

Use a short directory such as `C:\HASKA`. Enable long paths only through your normal organization policy. Run native PowerShell scripts; WSL2 is optional.

## Python packages missing

Linux: `./scripts/setup-linux.sh --python-deps`. Windows: `.\scripts\setup-windows.ps1 -PythonDeps`. This creates a local `.venv`.

## Claude commands missing

Confirm `.claude/skills/haska-video/SKILL.md` resolves. Rerun the platform setup. Start `claude` from the repository root.

## NVIDIA or Blender warning

Warnings are optional. Do not change drivers or system configuration solely for HASKA. Set `HASKA_BLENDER` to a tested local Blender executable.

## Reporting

Include OS, architecture, Node/Python/FFmpeg versions, the doctor output and a minimal non-private project. Remove usernames, paths, tokens and media before posting.
