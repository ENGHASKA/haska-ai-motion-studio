# Mode: cover / thumbnail

Stills: `CoverReel` (1080×1920, grid-crop safe square y 420–1500) and `CoverYouTube` (1280×720, bottom-right 310×145 stays empty).
Rules (`src/majed/cover-rules.ts`): title ≥ 170 px, other text ≥ 110 px, logo ≥ 200 px, lines ≥ 10 px, everything inside the safe area.
1. Compose props `{kind, title, subtitle?, imageSrc?}`; `guides: true` shows the safe zones (never in the final).
2. QA: `report: true` logs `[cover-result]` with the fitted size and rule issues; fix every issue. The layout is the same code the render uses (`coverLayout`).
3. Make three variants for YouTube; export with `npx remotion still` only when the user asks. Upscale/3840×2160 variants are re-renders with `--scale 3`.
Reference (optional): `third_party/majed-video/references/thumbnails.md`.
