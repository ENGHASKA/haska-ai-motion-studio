# Codex Project Instructions — AI Motion Studio

## Purpose

Build polished, deterministic local motion graphics with Remotion, React, TypeScript, GSAP, Three.js, React Three Fiber, FFmpeg, and portable Blender.

## Engineering rules

- Read applicable project skills in `.agents/skills/` before creating or reviewing motion.
- Prefer reusable components in `src/components/` and timing utilities in `src/lib/`.
- All rendered animation must be a pure function of Remotion's frame clock and input props.
- Use paused, frame-seeked GSAP timelines. Never use free-running timelines, `setTimeout`, CSS transitions, or unseeded randomness.
- Use `@remotion/three` for 3D compositions and derive transforms from `useCurrentFrame()`.
- Keep Studio access local to this machine; do not add public listeners, backends, databases, containers, telemetry, credentials, or paid APIs.
- Preserve the Intel/NVIDIA graphics configuration. Do not change drivers, GRUB, initramfs, kernels, Secure Boot, or system power modes.
- Keep large dependencies, caches and output inside the project-local ignored directories.
- For audio explainers, treat corrected transcript timestamps as source evidence and storyboard semantics as an explicit review step. Audio-reactive effects may support the design but may not substitute for content-aware visuals.
- Keep Arabic captions word- or line-based with an RTL base direction. Do not split Arabic into isolated letters.
- Do not invent exact software screens or actions without supplied visual references. Keep licensed SFX provenance in `public/sfx/licenses.json`.

## Verification

Run `npm run typecheck` after code changes. Preview with `./run-studio.sh`. For final video work, execute the relevant render and validate the output file, resolution, duration, and codec with `ffprobe`. Never claim a render succeeded without running it.

For Audio-to-Motion, also run `python3 scripts/audio_motion.py validate PROJECT`; render with `./render-audio.sh PROJECT PRESET`, which verifies both video and narration streams.

## Visual quality

Use a deliberate focal hierarchy, purposeful timing, motion arcs, overshoot only when stylistically justified, coherent transitions, and readable typography. Design for 1920×1080 safe margins unless the brief says otherwise. Avoid template-like gradients, excessive glow, gratuitous particles, and uniform fade-ups.

## Production workflow

New videos are driven by a ShotGraph + Style Profile (`production/projects/<id>/`, `src/production/`, `src/motion/`, `src/typography/`). Commands: `npm run production -- new|preview|validate|qa|render ID`; see `docs/production-workflow.md`. Keep text inside the platform safe area, never animate Arabic below word level, keep unknown asset licenses `unknown`, and do not render or approve without the user's explicit request.
