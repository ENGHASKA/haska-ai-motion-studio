---
description: Turn a local Arabic or English narration project into a reviewed semantic Remotion explainer
argument-hint: <project-id>
allowed-tools: Read, Edit, Write, Bash(npm run typecheck), Bash(python3 scripts/audio_motion.py *), Bash(./render-audio.sh *)
---

Build or refine the audio-to-motion project `$ARGUMENTS`.

1. Read `CLAUDE.md`, `AGENTS.md`, `docs/audio-to-motion.md`, and the applicable project skills under `.agents/skills/`.
2. Read `public/audio-projects/$ARGUMENTS/transcript.json` and `storyboard.json`. Treat timestamps and corrected transcript wording as source evidence. Never infer product UI screens, exact interfaces, logos, metrics, or factual claims not present in the narration or supplied visual references.
3. If `corrected` is false, ask the user to review transcript wording before final delivery. You may make an explicitly marked draft storyboard meanwhile.
4. Rewrite the storyboard so every scene has a defensible `semanticRationale`, exact start/end milliseconds, concise on-screen text, purposeful motion, and explicit asset requirements. Set a scene to `reviewed` only after its narration and visual metaphor agree.
5. Reuse `src/audio/` components. Add a custom deterministic scene only when the built-in visual kinds cannot express the spoken idea. Use Remotion's frame clock; GSAP must be paused and frame-seeked. Arabic must stay word- or line-animated with `dir="rtl"`.
6. Run `python3 scripts/audio_motion.py validate $ARGUMENTS`, activate it, and run `npm run typecheck`.
7. Start the local preview with `python3 scripts/audio_motion.py preview $ARGUMENTS`. When the user explicitly asks for export, render with `./render-audio.sh $ARGUMENTS youtube` (or `reel` / `tiktok`) and report the ffprobe-verified MP4.
