# Features and Architecture

[English](FEATURES.md) · [العربية](../ar/FEATURES.md)

HASKA uses Remotion as the master timeline. React components, paused/frame-seeked GSAP timelines and Three.js transforms are pure functions of frame and input props.

```text
brief or transcript
  -> ShotGraph / reviewed storyboard
  -> Style Profile + Asset Catalog
  -> routing (2D / Three / optional Blender sequence)
  -> QA + human approval
  -> Remotion render + FFprobe verification
```

## Production foundation

- ShotGraph controls timing, tracks, transitions and render-engine routing.
- Style Profiles control palette, typography, easing, safe areas and motion grammar.
- Asset Catalog records source and license; unknown assets remain `unknown`.
- QA checks schema, timing, safe areas, typography, assets and render compatibility.
- Approval records are content-bound and invalidated when the project changes.

## Motion and typography

Reusable primitives live in `src/motion/`, `src/components/` and `src/typography/`. Arabic shaping stays intact; animation granularity is word or line. The Majed-derived motion bank and references are pinned, audited and attributed.

## 3D and media

`@remotion/three`, React Three Fiber, Drei, Rapier and postprocessing support deterministic 3D. Blender outputs can be planned as image sequences but require an external local Blender install. FFmpeg handles normalization, cuts and export. whisper.cpp is optional and local.

## Project skills

Categories include HASKA routing, motion design, Remotion creation/markup/rendering/captions/maps/multimedia/studio/interactivity and upgrades. `/create-video` and `/audio-to-motion` are project commands for Claude Code.

## Majed compatibility

Included: motion moves/styles, Arabic text behavior, talking-head and montage concepts, covers, text-behind-subject, pacing references and EDL/OTIO interop. Excluded: paid fal.ai generation, unlicensed social-publishing code, unsafe self-update scripts, promotional/affiliate material, CapCut internals, and macOS-only Vision tools. See `docs/majed/parity-matrix.md`.

## Limits

HASKA does not invent exact product screens, logos or claims. No public server, cloud backend, database, telemetry or paid API is included. Hosted CI cannot verify aesthetic quality, audio listening, Windows GPU, OptiX or Blender GPU.
