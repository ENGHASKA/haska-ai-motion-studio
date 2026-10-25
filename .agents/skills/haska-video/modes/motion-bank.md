# Mode: motion bank (Arabic ads, kinetic typography, presets, styles)

**What exists:** 100 moves from the Majed motion bank run on Remotion's frame clock (`src/majed/`). 97 draw (text 26, transition 20,
camera 17, card 34); `jcut`, `matchCut`, `ramp` are timing rules, not drawings. 25 moves composite footage.
17 upstream visual styles are StyleProfiles: `production/style-profiles/majed-*.json` (`extends` haska-cyber).

**Steps**
1. Browse: `src/majed/catalog.ts` (`MOVES`, `moveById`) or the Studio folder *Motion-Moves* → `MoveShowcase` with `{move: "<id>"}`; list ids with `npm run compositions`.
2. Pick one style profile (HASKA built-ins first; `majed-*` for a different feel). Palette comes from the profile via `src/majed/palette.ts`.
3. Build the ad as a ShotGraph (`/create-video`). To use a move inside a scene: render `<MoveCanvas move="…" options={{…}} />` (text moves) or `<VideoMoveLayer …/>` (footage moves) from `src/majed/`.
4. Arabic: real Arabic text, word-level animation only, no letter-spacing (the move engine joins/kashidas itself). Fonts: IBM Plex Sans Arabic default; Majed fonts (Cairo, Tajawal, Lalezar, Readex Pro, Noto Kufi, Aref Ruqaa) are bundled OFL files in `public/fonts/majed`.
5. Moves needing a person matte (about 10), face/hand tracking (4) fall back or need a matte you supply; see `docs/majed/parity-matrix.md`.
6. Quran verse move (id 74): text must be supplied/verified by the user; never typed from memory.

Reference (optional): `third_party/majed-video/references/moves.md`, `motion-kit.md`, `word-fx.md`, `styles.md`.
