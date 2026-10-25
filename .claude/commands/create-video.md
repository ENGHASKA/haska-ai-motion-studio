---
description: Create or revise a video from a plain-language description. Builds a live preview first; renders only after you approve and ask.
argument-hint: <describe the video — or an existing project id to revise>
allowed-tools: Read, Edit, Write, Bash(npm run typecheck), Bash(npm run test:production), Bash(npm run production -- new *), Bash(npm run production -- list), Bash(npm run production -- activate *), Bash(npm run production -- preview *), Bash(npm run production -- validate*), Bash(npm run production -- qa *), Bash(npm run production -- bump *), Bash(npm run production -- shot-graph *), Bash(npm run production -- gate *), Bash(npm run production -- assets scan*), Bash(npm run production -- assets check), Bash(npm run production -- blender check *), Bash(npm run production -- blender plan *), Bash(npm run production -- approval status *), Bash(npm run production -- approval init *), Bash(npm run production -- approval submit *), Bash(npm run production -- verify-output *), Bash(python3 scripts/audio_motion.py *), Bash(python3 scripts/media_tools.py *)
---

You are creating or revising a video in this project: `$ARGUMENTS`

Work in this order. Cheap, reversible steps first; nothing expensive happens without the user.

## 0. Orient (one short command, no repeated analysis)
**Route first.** If the request involves the user's own footage, a podcast, montage, cover/thumbnail, text-behind-subject, a website/product explainer, a reference look, or an editor handoff, read `.agents/skills/haska-video/SKILL.md` and follow its mode file instead of steps 1-4 below (the safety rules in step 7 and Hard rules still apply).

Run `npm run production -- list`. If `$ARGUMENTS` names an existing project id, you are **revising** it: read `production/projects/<id>/brief.md` and `shot-graph.json`, then skip to step 5. Otherwise you are **creating**.

**Narrated video?** If the user supplies narration audio, stop here and use `/audio-to-motion <project-id>` (Whisper transcript → reviewed storyboard → `AudioExplainer*` compositions). Everything below is for videos without a supplied narration track.

## 1. Understand, and ask only what is essential
From the request, infer goal, audience, language, platform, duration, and tone. Ask **one** short message with at most three questions, and only for things you truly cannot infer:
- the message / exact wording that must appear (never invent claims, metrics, product screens, or logos),
- platform and length (`youtube` 16:9, `reel` / `tiktok` 9:16, `square`, `web-hero`),
- language (`en` or `ar`; Arabic is right-to-left) and any brand assets that exist.

State the defaults you will use for everything else (style `haska-cyber`, platform `youtube`, ~10 s).

## 2. Choose style and format
Style profiles live in `src/production/style-profile.ts` (built-in: `haska-cyber`, `haska-signal`) and `production/style-profiles/*.json` (custom, may `extends` a built-in). They control palette, fonts, easing, durations, transitions, and platform safe areas — change the profile, not individual components, to restyle a whole video. Offer one fitting choice, not a menu.

## 3. Load only the skills this video needs
Do **not** read every skill. Read `.agents/skills/motion-design/SKILL.md` before designing motion (timing, easing, choreography). Add others only when the shot needs them:

| Need | Read |
| --- | --- |
| Custom React/Remotion component | `.agents/skills/remotion-best-practices/remotion-markup/REFERENCE.md` |
| Arabic / RTL text beyond the built-in components | `.agents/skills/remotion-best-practices/remotion-markup/arabic-text.md` |
| Captions / subtitles | `.agents/skills/remotion-captions/SKILL.md` |
| Maps | `.agents/skills/remotion-maps/SKILL.md` |
| Render / export questions | `.agents/skills/remotion-render/SKILL.md` |
| Chart / dashboard visuals | the `dataviz` skill |

## 4. Plan, then scaffold
Show a compact shot plan (id · seconds · on-screen text · composition · transition) and then build it — the preview is cheap, so do not wait for sign-off unless the request was ambiguous.

`npm run production -- new <id> --title "<title>" --platform <platform> --language <en|ar> --style <style>`

Then edit `production/projects/<id>/brief.md` (goal, audience, key lines, assets) and `shot-graph.json`:
- Frames, not seconds: `startFrame` / `durationFrames`, fps from the graph. Track 0 is the main timeline; shots must tile it without gaps or overlap. Higher `track` numbers are overlays.
- **Engine routing** (`composition` field): `title` (eyebrow, headline, subtitle via `engineOptions.eyebrow/subtitle/layout`), `network` (animated topology + caption), `semantic` (legacy `visualKind` scenes), `LabakPromo` / `CybersecurityIntro` (existing scenes), `CyberGrid3D` (engine `three`). `engine: "blender"` plays a pre-rendered PNG sequence described by `engineOptions.blender` (see `docs/production-workflow.md`); use Blender only for cinematic scenes that justify an offline render, and **never start a Blender render yourself**.
- `transitionIn` on a shot blends it with the previous one on the same track (`crossfade`, `push`, `wipe`, `camera-pull`, `zoom-through`, `match-cut`, or `cut`). Copy the profile's grammar: `motion.transitions.scene`.
- Write Arabic as real Arabic text. Do not insert spaces or marks between letters and never split Arabic below word level. Set the graph `language` so mixed lines (for example a Latin brand inside an Arabic sentence) keep the right reading order.
- A new component is justified only when the built-ins cannot express the idea: add it under `src/production/render/`, add its name to `BUILTIN_SHOT_COMPONENTS` in `src/production/routing.ts`, and to `SHOT_COMPONENTS` in `src/production/render/shots.tsx` (the compiler enforces both). Use `useCurrentFrame()`, the `src/motion/` primitives (`KineticText`, `Reveal`, `CameraRig`, `ParallaxLayer`, `AnimatedBackground`, `Glow`, `GsapStagger`), and never timers, CSS transitions, unseeded randomness, or `useFrame()`.
- Real assets only: put supplied files under `public/`, run `npm run production -- assets scan --write`, and leave `license` as `unknown` until the user states it. Use a clearly labelled text placeholder when no logo exists.

## 5. Check, then preview
```
npm run production -- validate <id>
npm run production -- qa <id>          # typography, safe areas, assets, routing, render compatibility
npm run typecheck                      # only if you changed code
npm run production -- preview <id>     # run in the background; starts Remotion Studio on localhost only
```
Fix every QA **error**; explain each warning briefly. Tell the user the preview is **http://localhost:3000/ProductionVideo** and what to look at. Remember QA only prevents overflow/safe-area/asset problems — pacing, taste, Arabic typographic quality, and licensing still need their review (QA prints the list).

## 6. Iterate on single scenes
For "change scene 2": edit only that shot, `npm run production -- bump <id>`, re-run `qa`, and the open Studio reloads. Any content change automatically invalidates an earlier approval; you do not need to manage that.

## 7. Export — only when the user explicitly asks
1. Run `npm run production -- approval submit storyboard <id> --actor claude`.
2. **Do not approve it yourself.** Ask the user to review the preview and run, in this session: `! npm run production -- approval approve storyboard <id> --actor <their name>`.
3. When they confirm and ask for the export, run `npm run production -- render <id>` (add `--out FILE` if asked). It runs QA, checks approval, renders, and verifies the MP4 with ffprobe. Report the verified path and the ffprobe summary it prints, and repeat the human-review list.

## Hard rules
- Local only: no cloud services, uploads, downloads, or new dependencies. Ask before installing anything, including fonts.
- Never claim a preview or render you did not run. Never invent logos, UI screens, statistics, or testimonials.
- Never run `approval approve|reject`, a Blender render, or a render without the user asking for it.
