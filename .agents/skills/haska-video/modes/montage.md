# Mode: rhythm montage

1. Beat grid from the music: `python3 scripts/media_tools.py beats public/<p>/music.wav production/work/<p>-beats.json` (spectral-flux; ±30 ms, tempo within ~1%; check by eye/ear on the preview).
2. Studio → `MontageReel` props `{clips: [{src, available}], beats: <beats.json beats>, audioSrc, everyBeats: 2}`. Cuts land exactly on beat frames; each beat gets a decaying punch-in (`src/majed/montage.ts`).
3. Add typography with `modes/motion-bank.md`; transitions: moves of category `transition` (e.g. `punchCut`, `swishSettle`, `craneUp`).
4. Licensing: music must have a stated licence; say so if none is available. Never add unlicensed music.
Reference (optional): `third_party/majed-video/references/montage.md`, `beat-fx.md`.
