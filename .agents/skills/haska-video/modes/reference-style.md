# Mode: reference-based styling

1. Palette from an image the user supplies: `python3 scripts/media_tools.py palette ref.png production/style-profiles/ref-<name>.json --name "<name>"` (dominant colours, fixed seed → same result every run). Then `npm run production -- validate`; fix any contrast error by hand.
2. Otherwise choose the nearest `majed-*` or HASKA profile. Typography/pacing from a reference video is a manual judgement: describe what you see, do not claim automated extraction.
3. Colour-only: the tool copies no artwork, logos or fonts from the reference.
