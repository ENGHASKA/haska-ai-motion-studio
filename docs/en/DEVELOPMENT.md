# Development

[English](DEVELOPMENT.md) · [العربية](../ar/DEVELOPMENT.md)

## Setup and checks

```bash
npm ci
npm run typecheck
npm run test:production
python3 -m unittest discover -s tests/python -v
npm run smoke:majed
```

Run `npm run studio` for a local loopback preview. Do not commit `node_modules`, caches, renders, recordings, models, local configuration or production projects.

## Determinism

Use `useCurrentFrame()` and `useVideoConfig()`. GSAP timelines must be paused and seeked from frame/fps. Use `ThreeCanvas` for rendered 3D and do not use free-running loops, timers, CSS transitions or unseeded randomness.

Reusable components belong in `src/components/`, motion utilities in `src/motion/` or `src/lib/`, and typography in `src/typography/`.

## Production changes

Validate ShotGraph/style/assets with `npm run production -- validate`, run `npm run production -- qa ID`, and keep text in the platform safe area. Arabic is never split below word level. Do not approve on behalf of a reviewer.

## Skills

Read the applicable `.agents/skills/*/SKILL.md` before changing motion. Keep skills narrowly scoped, local-only and free of embedded credentials, promotions or auto-update behavior.

## Pull requests

Keep changes focused, update English and Arabic docs together, add tests for behavior, and state what was actually verified. A CI pass does not prove visual or audio quality.

## Releases

`npm run release:build` runs required checks, scans the allow-listed snapshot, builds Windows ZIP and Linux tar.gz archives, writes SHA-256 files and verifies fresh extraction. Tags use SemVer; prerelease tags remain prereleases.
