# Production workflow

How a described video becomes a previewed, approved, exported MP4. Everything runs locally; the preview binds to `127.0.0.1` only.

## Start, preview, validate, render

| Goal | Command |
| --- | --- |
| Create or revise a video from a description | `/create-video <description or project id>` in Claude Code |
| New project by hand | `npm run production -- new <id> --title "…" --platform youtube\|reel\|tiktok\|square\|web-hero --language en\|ar --style haska-cyber` |
| Live preview | `npm run production -- preview <id>` → `http://localhost:3000/ProductionVideo` (Studio reloads the active project) |
| Validate schemas, catalog, projects | `npm run production -- validate [id]` |
| Typography / safe-area / asset / routing checks | `npm run production -- qa <id>` |
| Approve (a person, not Claude) | `npm run production -- approval submit\|approve storyboard <id> --actor NAME` |
| Render + verify | `npm run production -- render <id> [--out FILE] [--dry-run]` |
| Check an existing MP4 | `npm run production -- verify-output <id> <file.mp4>` |
| Tests | `npm run test:production` |

`render` runs QA, then the approval gate, then Remotion, then ffprobe verification (codec, size, fps, duration, audio). `--dry-run` stops before Remotion and prints the exact command.

Narrated videos use the Audio-to-Motion flow (`/audio-to-motion`, `./render-audio.sh`). It now runs on the same shot graph, style profile, and frame model.

## How the pieces connect

```
production/projects/<id>/shot-graph.json ──┐
production/style-profiles/*.json + built-ins ├─► npm run production -- activate/render
production/asset-catalog.json ────────────┘        │ props = {graph, style, assets}
                                                    ▼
                          composition ProductionVideo  (src/production/render/)
        ShotTimeline ─ planTimeline: tracks, transitions, tails  (src/motion/transitions.ts)
        routeName ─ engine/composition → title | network | semantic | existing scene | blender
        shots use src/motion/* + src/typography/*, which read the Style Profile
```

- **One clock.** `src/production/timing.ts` is the only ms→frame rule (`Math.round`). Scene boundaries, captions, audio, and shots all use it, so adjacent ranges share boundaries (the earlier floor/ceil mix overlapped scenes by a frame).
- **Style Profile → pixels.** Palette → backgrounds, text, glow; typography → font stacks per script and tracking; `motion.easings`/`durationsMs` → every `Reveal`, `KineticText`, and transition; `platforms` → safe boxes, vertical title scale, caption placement. Changing the profile restyles the video without touching components.
- **Transitions.** `transitionIn` blends a shot with the previous one on its track over its first N frames; the outgoing shot stays mounted for those N frames. Two identical *time-aligned* built-in scenes skip the blend because both copies would draw the same pixels.
- **Layers.** Higher `track` renders on top. Camera motion (`CameraRig`, `ParallaxLayer`) moves backgrounds; text stays put inside the safe area.
- **Approval.** The record is bound to a hash of the *reviewable content* (timing, text, assets, engines, transitions, style id). Shot `approval` flags, `version`, and timestamps are excluded, so bookkeeping never invalidates an approval but any real edit does. Records with illegal histories are refused on load. New projects start tracked as `draft`; legacy audio projects without a record still render (set `HASKA_REQUIRE_APPROVAL=1` to forbid that).

## Typography (Arabic + English)

- Direction comes from the video language and the words, not the first letter (`textDirection`): an Arabic video whose line begins with a Latin brand stays right-to-left.
- Text is fitted before it animates (`fitText`): the font shrinks to the box, words never split, overflow is reported (`data-fits="false"`, QA `text-overflow`). Wrap and spacing use a fixed `0.3em` word gap shared by renderer and measurer.
- Animation units are words, phrases, or lines. `char` mode exists for Latin only and is downgraded to `word` for Arabic. Letter spacing is never applied to Arabic (it breaks joining).
- Arabic punctuation (`، ؟ ؛`) replaces Latin marks after Arabic letters; digit style is selectable (`keep|western|arabic-indic`).
- Fonts: nothing is downloaded. Installed fonts used: Liberation Sans/Mono (SIL OFL) and DejaVu Sans (Bitstream Vera licence) for Arabic. QA checks glyph coverage against what fontconfig reports as installed. Adding a better Arabic face (for example Noto Sans Arabic) needs your approval first.

## Blender shots

A shot with `engine: "blender"` carries `engineOptions.blender`, a `BlenderShotManifest` (`src/production/blender-shot.ts`): scene + texture asset ids, fps, size, frame range, colour space (working / view / output), device, samples, the PNG-sequence location under `public/renders/<shot>/`, and a cache key hashing the scene, textures, and settings. `npm run production -- blender check <id>` reports missing frames (as shot-local ranges), missing assets, and stale caches; `blender plan` prints the command for the project's portable Blender (`./blender-studio.sh … scripts/blender_render_shot.py`). Nothing starts Blender automatically, and the render script has **not been executed** yet.

## Assets

`npm run production -- assets scan --write` indexes existing files under `public/` and `fixtures/` in place (nothing copied or downloaded), records hashes, records identical copies as `alsoAt`, skips sensitive-looking names and derived files, and leaves `license` and commercial use `unknown`. Only `public/` is served by the preview; the catalog is the place to check what lives there.

## Quality assurance

`qa` checks: schema validity, transitions, routing, even dimensions / integer fps, text fit and minimum size, safe-area containment, glyph coverage, asset presence + hashes + servability, audio presence/length against the timeline, Blender frames and cache. For audio projects it also checks narration length against the storyboard in frames, caption/word ranges, and caption fit on all three presets. `verify-output` checks the exported MP4.

**Still requires a person:** pacing and rhythm; composition and taste; Arabic typographic quality in the final render (joining, line breaks, diacritics) by a fluent reader; colour/glow/contrast on real displays; narration–visual meaning and factual accuracy; asset licences and attribution; transition feel; and any Blender shot's noise and colour look. A passing QA run is not an approval.

## Known limitations

- Text measurement in the browser uses the canvas of the installed fonts; QA uses a conservative estimate, so QA can warn about text that renders fine.
- `SemanticScene` (legacy audio scenes) is CSS-sized and does not auto-fit; QA flags long lines instead.
- No motion blur (`@remotion/motion-blur` is not installed); no per-letter Arabic animation.
- Unrendered Blender frames, and the Blender script itself, are untested end to end.
