# Third-party notices

HASKA AI Motion Studio original code is MIT licensed. Components below retain their own licenses; this is not legal advice.

| Component | Location | License |
| --- | --- | --- |
| Majed Video allow-listed motion bank, styles, Arabic text engine and references, pinned to `886cae69…` | `third_party/majed-video/`, derived `src/majed/engine-core.js` | MIT, Copyright (c) 2026 Majed Alzaabi |
| Cairo, Inter, Lalezar, Noto Kufi Arabic, Readex Pro, Tajawal, Amiri Quran, Aref Ruqaa | `public/fonts/majed/` | SIL OFL 1.1 |
| IBM Plex Sans Arabic | `public/fonts/ibm-plex-sans-arabic/` | SIL OFL 1.1 |

Preserve the bundled Majed and font license texts when redistributing. Fonts may not be sold by themselves.

Dependencies installed through `npm ci` retain their own terms. React, Three.js and many related packages use permissive licenses; TypeScript is Apache-2.0, postprocessing is zlib, and GSAP uses the GreenSock standard license.

Optional Python media support installs the exact packages listed in `requirements-media.txt` from PyPI; they are not bundled in this repository or its source archives. NumPy uses BSD-3-Clause plus the licenses recorded in its distribution metadata, SciPy uses BSD-3-Clause plus its bundled notices, and Pillow uses MIT-CMU plus its bundled notices. Preserve the license metadata installed with those distributions.

**Remotion is governed by the Remotion License, not HASKA's MIT license.** Free-use eligibility and company-license requirements depend on organization size and use case. Review <https://www.remotion.dev/docs/license> and the installed `node_modules/remotion/LICENSE.md`.

FFmpeg, Blender, whisper.cpp, models, Chromium and Python tools are installed separately and are not bundled. FFmpeg terms depend on the selected build/codecs; Blender is GPL; whisper.cpp is MIT and model licenses vary.

Private recordings/projects, models, credentials, renders, unlicensed `majed-plugins` code, paid fal.ai integrations, social publishing, promotional content, unsafe self-update scripts and CapCut internal-file manipulation are excluded.

See `docs/en/LICENSING.md`, `docs/ar/LICENSING.md`, `docs/majed/AUDIT.md` and `third_party/majed-video/UPSTREAM.json`.
