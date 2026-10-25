# Contributing

Open an issue before a broad architectural change.

1. Fork and create a focused branch.
2. Run `npm ci`.
3. Make deterministic, local-only changes.
4. Run `npm run typecheck`, `npm run test:production`, `python3 -m unittest discover -s tests/python -v` and relevant smoke checks.
5. Update English and Arabic documentation together.
6. Open a pull request describing behavior, tests and anything not verified.

Do not submit private footage, narration, client names, credentials, models, renders or assets without redistribution evidence. New assets need source and license in the Asset Catalog; use `unknown` until verified.

Motion must use the Remotion frame clock. GSAP stays paused/frame-seeked, 3D uses `@remotion/three`, and Arabic is never split below a word. Read the applicable project skill before changing motion.

Contributions are licensed under the repository MIT license unless a file clearly carries another compatible license.
