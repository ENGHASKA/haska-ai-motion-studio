# Mode: talking head / own footage (silence removal, text-based cuts, captions)

Footage must be under `public/<project>/` (git-ignored if private; never commit private video).

1. Transcribe with Whisper.cpp (`python3 scripts/audio_motion.py` flow or `tools/whisper-cli`); keep the transcript JSON (`segments[].words[]` in ms).
2. Silence plan: `python3 scripts/media_tools.py silence public/<p>/take.mp4 production/work/<p>-plan.json` (tune `--noise -35 --min 0.45 --pad 0.08`).
3. Text cuts (drop/keep/undo by phrase or word range; never destructive, undo replays):
   `python3 scripts/media_tools.py textcut PLAN TRANSCRIPT --drop "phrase"` | `--keep "phrase"` | `--drop-range I J` | `--undo`.
4. Captions on the edited timeline: `python3 scripts/media_tools.py captions PLAN TRANSCRIPT OUT.json`.
5. Preview: Studio → `TalkingHeadReel` props `{src, keep: plan.keep, transcript}` (duration is computed from the plan).
6. Cover/thumbnail: `modes/cover.md`. Handoff to an editor: `modes/finish-and-interop.md`.

Check that no cut lands mid-word: the plan pads 80 ms around speech; listen once in the preview. Do not render the final MP4 until asked.
Reference (optional): `third_party/majed-video/references/script-map.md`, `cut-styles.md`.
