# Mode: sound finishing and editor handoff

Finishing (offline, FFmpeg):
- Master to -14 LUFS / -1.5 dBTP, two-pass linear: `python3 scripts/media_tools.py master in.wav out.wav [--enhance]` (`--enhance`: high-pass, denoise, gentle compression).
- Picture scopes: `python3 scripts/media_tools.py check video.mp4` (clipped highlights, crushed blacks, oversaturation).
- Original synthesized soundtrack: `scripts/sound_design.py` (no downloads). Licensed music only when the user supplies it with a stated licence.

Handoff: `python3 scripts/media_tools.py edl PLAN OUT.edl --fps 30` (CMX3600 for DaVinci/Premiere) or `otio` (OpenTimelineIO JSON). The EDL/OTIO describe cuts of the **source** clip, not Remotion graphics.
CapCut: no safe documented import format is vendored (upstream exporter uses undocumented draft files and `exec`); use the rendered MP4 or the EDL. DaVinci scripting (`majed-davinci`) needs Resolve Studio on macOS and is not integrated.
