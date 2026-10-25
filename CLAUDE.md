# Claude Code Instructions — AI Motion Studio

This is a local Remotion motion-design project. Convert natural-language video descriptions into deterministic React/TypeScript compositions that preview and render identically.

## Required workflow

1. Read the relevant skill under `.agents/skills/` before designing motion.
2. Inspect existing components and reuse them before adding new abstractions.
3. Register every composition in `src/root.tsx` with an explicit ID, FPS, duration, width, and height.
4. Drive animation from `useCurrentFrame()` and `useVideoConfig()`. Do not use wall-clock timers, CSS transitions, random values without a fixed seed, or autoplay animation loops.
5. For GSAP, create paused timelines and seek them from `frame / fps`; never let a timeline free-run during rendering.
6. For React Three Fiber, use `ThreeCanvas` from `@remotion/three` and derive transforms from Remotion's frame clock. Do not use `useFrame()` for rendered motion.
7. Use professional hierarchy, intentional easing, restrained effects, safe margins, and a clear beginning/middle/end. Avoid generic fade-up-only animation.
8. Keep all services local. Never expose the Studio publicly or add cloud dependencies, credentials, analytics, databases, or paid services without explicit approval.
9. Run `npm run typecheck` after edits. For delivery, run `./render-sample.sh` or the matching Remotion render command and verify the media with `ffprobe`.

## Audio-to-Motion workflow

For spoken Arabic or English narration, read `docs/audio-to-motion.md` and use `/audio-to-motion <project-id>`. The corrected `transcript.json` is evidence; `storyboard.json` is the editable semantic plan. Match visuals to meaning, not merely amplitude. Never invent exact software UI, brand assets, metrics, or steps without supplied references. Keep Arabic captions word-based with RTL direction, preserve the narration track, and validate every export through the project CLI.

## Production workflow (new videos)

Use `/create-video <description>` for any new or revised video without supplied narration. It scaffolds `production/projects/<id>/` (brief + ShotGraph), checks it, opens the Studio preview at `http://localhost:3000/ProductionVideo`, and exports only after approval. Narrated videos still use `/audio-to-motion`. Details: `docs/production-workflow.md`.

- Shots, timing, transitions, and engine routing live in the ShotGraph; look and feel (palette, fonts, easing, safe areas) live in the Style Profile and are applied by `src/motion/` and `src/typography/`. Do not hard-code colors or fonts in shot components.
- Run `npm run production -- qa <id>` before previewing or rendering; it does not replace human review of pacing, Arabic typography, and licensing.
- Never approve a storyboard on the user's behalf and never render without an explicit request.

## Commands

- Preview: `./run-studio.sh` → `http://localhost:3000`
- Health: `./healthcheck.sh`
- TypeScript: `npm run typecheck`
- Sample MP4: `./render-sample.sh`
- List compositions: `npm run compositions`
- Audio health: `python3 scripts/audio_motion.py doctor`
- Import: `python3 scripts/audio_motion.py import AUDIO --name PROJECT --language ar|en`
- Preview audio project: `python3 scripts/audio_motion.py preview PROJECT`
- Render audio project: `./render-audio.sh PROJECT youtube|reel|tiktok`
- Reel audio tooling: `python3 scripts/align_words.py ID` (caption timing from the recording), `python3 scripts/sound_design.py ID` (original music + SFX + mix report); details in `docs/audio-to-motion.md`
- Production checks: `npm run production -- validate` (style profile, asset catalog, storyboards)
- Production tests: `npm run test:production`
- New video: `/create-video` · project commands: `npm run production -- new|list|activate|preview|validate|qa|bump|render ID`
- Assets: `npm run production -- assets scan [--write]` · Blender checks: `npm run production -- blender check|plan ID`
- Approval: `npm run production -- approval init|status|submit|approve|reject|reopen storyboard|brief ID --actor NAME` — see `docs/production-foundation.md`; a tracked storyboard must be approved (for its current content) before `./render-audio.sh` will render

Never read or print authentication files, API keys, tokens, or unrelated private configuration.
