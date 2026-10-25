# Changelog

This project follows Semantic Versioning and uses prereleases while native Windows hardware coverage is incomplete.

## [0.1.0-beta.1] - 2026-10-25

### Added

- Clean public snapshot with equivalent English and Arabic documentation.
- Linux and native Windows setup, doctor and launcher scripts.
- ShotGraph, Style Profiles, Asset Catalog, QA and approval workflow.
- Deterministic Remotion/GSAP/Three.js motion and optional Blender routing.
- Audio-to-Motion with reviewed storyboards and RTL/LTR captions.
- Audited Majed-derived capabilities and project-scoped Claude skills.
- Ubuntu/Windows CI and reproducible ZIP/tar.gz packaging with checksums.

### Security

- Excluded private projects, narration, renders, models, credentials, caches and local configuration.
- Replaced the private active narration snapshot with the synthetic public sample.
- Overrode Remotion's pinned vulnerable zod 4.5.4 with patched zod 4.6.7.
- Public repository starts from a clean snapshot; private development history is not published.

### Known limitations

- Native Windows media, Chromium and GPU workflows require real-hardware validation.
- Hosted runners do not verify NVIDIA, OptiX or Blender GPU.
- Editing compositions without supplied media show labeled placeholders.
