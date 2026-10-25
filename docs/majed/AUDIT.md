# Audit of the Majed Video sources (before integration)

Nothing from the upstream repositories was executed. Sources were downloaded as pinned commit archives into an empty
scratch directory, hashed, read, and an allow-listed subset of **text, data and reference code** was vendored by
`scripts/vendor_majed.py` (provenance and per-file SHA-256 in `third_party/majed-video/UPSTREAM.json`).

| Repository | Pinned commit | Licence | Outcome |
| --- | --- | --- | --- |
| `majedphotos/video-ad-editor` v6.1.0 | `886cae69add821367f6c7bb9d9115a34e2427b21` (archive sha256 `c778435c…85b3`) | MIT | 62 of 336 files vendored |
| `majedphotos/majed-plugins` | `22ae9594fde716178602fae728a9d73a3b56406d` | none at root (MIT only in `script/`, `live-stage/`) | not vendored |
| `majedphotos/majed-davinci` | `331ea9db729e636c2fc80e1450552b7994a9afb3` | MIT | not vendored; needs DaVinci Resolve Studio on macOS |

## What upstream really is
A Claude-skill workflow (Arabic) over Python/Node scripts with **its own render engine** (puppeteer-core drives headless
Chrome frame by frame, then ffmpeg). The four sibling skill folders (`motion-video`, `montage-video`, `podcast-video`,
`thumbnail-video`) are thin wrappers that point back to the shared `video-ad-editor` scripts.
HASKA already has a master timeline (Remotion), so the engine is **not** adopted; the motion bank, styles, Arabic text
engine, references, and workflow ideas are ported to run on Remotion.

## Differences between README claims and the code
- README says "Mac and Windows"; **Linux is not claimed**. `render.js` hard-codes the macOS Chrome path; four tools are Swift/Vision (macOS only: `personmask`, `facetrack`, `handpose`, `hdr2sdr`).
- README says "6 skills"; `plugin.json` lists 5 (the DaVinci skill lives in a separate repo).
- The move catalog advertises 100 moves; 97 have a drawing function. `jcut`, `matchCut` are rule entries and `ramp` is a time helper.
- "Offline/local" is mostly true, but several scripts reach the network: Wikimedia asset fetch, Google Drive `curl`, a Quran API, GitHub update checks, `deep-filter` binary download, SigLIP2 model download, and paid fal.ai generators (`FAL_KEY`).

## Risks found and how HASKA handles them
| Finding | Handling |
| --- | --- |
| `00_setup.sh` silently checks GitHub; `--update` runs `rsync -a --delete` over its own folder from a downloaded release; also `sudo apt install ffmpeg` | Not vendored, never run. Auto-update stays **disabled**: upstream is pinned by commit; updating = re-running the vendor script by hand on a new reviewed commit. |
| SKILL.md footer tells the assistant to append a course/discount promotion and an Instagram link to deliveries; `references/keyword-automation.md` carries an affiliate code | SKILL.md files and that reference are excluded. HASKA skills contain no promotion. |
| `40_capcut.py` uses `exec()` on sliced source and undocumented CapCut draft files | Not vendored; interop is done with EDL/OTIO. |
| `17_gen_scenes.py`, `21_avatar_scene.py` call paid fal.ai | Not vendored; status `blocked` until the user approves a paid service. |
| `studio/studio.py` local HTTP server | Not vendored; Remotion Studio (loopback only) replaces it. |
| Vendored three.js (14 MB previews, libraries) | Excluded; HASKA depends on its own `three`. |
| `majed-plugins/content-engine` has no licence and publishes via a cloud service | Not vendored. |

## Licences carried into HASKA
Upstream MIT text: `third_party/majed-video/LICENSE`. Fonts (all SIL OFL 1.1): `public/fonts/majed/LICENSES.txt`.
Summary of third-party notices: `THIRD_PARTY_NOTICES.md`.
