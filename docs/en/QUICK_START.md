# Quick Start

[English](QUICK_START.md) · [العربية](../ar/QUICK_START.md)

Run `npm run doctor`, then start `npm run studio` and open <http://localhost:3000>.

## Text-to-video

```bash
npm run production -- new first-video --title "First Video" --platform youtube --language en --style haska-cyber
npm run production -- validate first-video
npm run production -- qa first-video
npm run production -- preview first-video
```

Edit `production/projects/first-video/brief.md` and `shot-graph.json`. Available formats include `youtube` (16:9), `reel`/`tiktok` (9:16), `square` and `web-hero`. Built-in styles include `haska-cyber` and `haska-signal`; custom profiles live under `production/style-profiles/`.

With Claude Code, run `claude`, then:

```text
/create-video A ten-second Arabic product introduction for a vertical Reel
```

Claude prepares and previews the ShotGraph. It must not approve or render on your behalf.

## Audio-to-Motion

```bash
python3 scripts/audio_motion.py import /path/to/narration.wav --name first-audio --language ar
python3 scripts/audio_motion.py validate first-audio
python3 scripts/audio_motion.py preview first-audio
```

Correct `transcript.json`, then review `storyboard.json` scene semantics. In Claude Code use `/audio-to-motion first-audio`. Audio energy can support motion but cannot replace content-aware storyboarding.

Arabic captions use an RTL base direction and animate by line or word, never isolated letters.

## Approval and render

After reviewing the preview:

```bash
npm run production -- approval submit storyboard first-video --actor contributor
npm run production -- approval approve storyboard first-video --actor YOUR_NAME
npm run production -- render first-video
```

Only the human reviewer runs the approval command. Audio projects render with `./render-audio.sh first-audio youtube`. Each render command validates the project and FFprobe output.
