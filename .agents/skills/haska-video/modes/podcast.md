# Mode: podcast / long recording → Reels

1. Transcribe (Whisper.cpp). Find 20–60 s self-contained moments from the transcript text; present candidates with timestamps and a one-line reason each. Do not invent quotes.
2. For each chosen moment: `modes/talking-head.md` steps 2–5 (silence + text cuts + captions), 1080×1920.
3. Hook: first 1.5 s should show the strongest line as large Arabic kinetic text (`modes/motion-bank.md`).
4. Multi-camera / wide shot: switch sources by composing `Sequence`s of `Html5Video`; speaker detection is not automated here (upstream face tracking is macOS-only).
5. Episode cover: `modes/cover.md`.
Reference (optional): `third_party/majed-video/references/podcast.md`, `podcast-hook.md`, `podcast-upgrades.md`.
