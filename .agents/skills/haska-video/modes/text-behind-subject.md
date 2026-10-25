# Mode: text behind the subject

Needs a **matte** video (white = subject, black = background), same framing and length as the footage.
- Green/blue screen: `python3 scripts/media_tools.py matte footage.mp4 matte.mp4 --key 0x00ff00`.
- Otherwise supply a matte from any rotoscoping/segmentation tool. The upstream macOS Vision matte tool is **not** available on Linux/Windows (status `platform-optional`); do not claim automatic person cut-out.
Composition `TextBehindSubject` props `{src, matte, text, textStart, startFromSeconds}`: footage → headline → subject re-drawn on top via the matte (frame-exact, waits for both videos to seek).
Verified with a synthetic green-screen fixture (`scripts/smoke_majed_features.mjs`); try real footage at low resolution first.
Reference (optional): `third_party/majed-video/references/backdrop.md`.
