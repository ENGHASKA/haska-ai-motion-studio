# Production Foundation (Milestone 1)

Typed, dependency-free building blocks under `src/production/`. Nothing here renders video, calls a network service, or downloads assets or fonts. Existing compositions, the Audio-to-Motion pipeline, and `render-sample.sh` are unchanged; the only edit to existing runtime code is the approval gate in `scripts/audio_motion.py`.

| Module | File | Purpose |
| --- | --- | --- |
| Style profiles | `style-profile.ts` | Palette, typography refs, motion/transition grammar, camera + lighting metadata, platform parameters (safe areas, sizes). Supports `extends`, WCAG contrast checks, and a built-in `haska-cyber` profile that mirrors the existing scenes. |
| Shot graph (storyboard v2) | `shot-graph.ts` | Frame-based shots on tracks, semantic descriptions, engine (`remotion`\|`three`\|`blender`), asset refs, transitions, per-shot approval state, graph versioning. Adapts v1 storyboards both ways without modifying them. |
| Asset catalog | `asset-catalog.ts`, `asset-files.ts` | Content-addressed ids (`<type>-<sha256[0:12]>`), source/license provenance, attribution, safe project-relative paths, file existence + hash verification. |
| Approval | `approval.ts`, `store.ts` | `draft → review → approved \| rejected` with attributable history. Approval is bound to a hash of the content, so any edit invalidates it. |

Validators return every issue (not just the first) plus non-blocking warnings. `schemaVersion` is checked everywhere; unknown fields are errors, and `extensions` / `engineOptions` carry custom data.

## Storyboard compatibility

`loadStoryboardDocument()` accepts v1 (`scenes`, `visualKind`, ms timing) or v2 (`shots`) and returns a validated shot graph. v1 → v2 keeps `visualKind` and stores the original ms values in `shot.legacy`, so `shotGraphToStoryboard()` round-trips exactly. v1 `reviewed` maps to `review`, never `approved`. `production/examples/starter.shot-graph.json` is the public v2 example.

## Approval workflow

```bash
npm run production -- approval init storyboard my-project --actor sara
npm run production -- approval submit storyboard my-project --actor sara
npm run production -- approval approve storyboard my-project --actor omar --note "pacing OK"
npm run production -- approval status storyboard my-project
```

Records live in `production/approvals/<kind>--<id>.json`. `reject` requires a note; `approve`/`reject` require `--actor`. Briefs are files at `production/briefs/<id>.json|.md`.

**Render gate.** `render()` in `scripts/audio_motion.py` (used by `./render-audio.sh` and `npm run audio`) runs `gate storyboard <id>` first.

- Tracked project: only an approval of the current content passes; editing the storyboard (formatting-only JSON changes excepted) requires a new review.
- Untracked project: allowed with a notice, so existing workflows keep working. Set `HASKA_REQUIRE_APPROVAL=1` to block untracked projects too.

## Commands

```bash
npm run production -- validate         # style profile, asset catalog (+ files/hashes), all audio-project storyboards
npm run production -- shot-graph ID    # print a project's storyboard as a v2 shot graph (writes nothing)
npm run test:production                # unit + non-rendering regression tests
```

`scripts/ts-run.mjs` compiles with the project's own `tsc` into `.cache/production-build/` and runs the result with plain Node (the system Node build here cannot strip TypeScript types itself).

## Adding an asset

Register local files only; `describeLocalAsset()` (in `asset-files.ts`) hashes a file and returns a catalog entry to append to `production/asset-catalog.json`. Fonts are referenced by family in a style profile; set `assetId` once the font file is catalogued.
