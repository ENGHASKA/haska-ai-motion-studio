# Licensing

[English](LICENSING.md) · [العربية](../ar/LICENSING.md)

This document is a technical license inventory, not legal advice.

## HASKA code

Original code in this public snapshot is licensed under the repository's MIT `LICENSE`. That license does not replace or relicense third-party components.

## Bundled third-party material

- Majed Video allow-listed code and reference text: MIT, copyright Majed Alzaabi; exact pinned commit and hashes are in `third_party/majed-video/UPSTREAM.json`.
- Cairo, Inter, Lalezar, Noto Kufi Arabic, Readex Pro, Tajawal, Amiri Quran, Aref Ruqaa and IBM Plex Sans Arabic: SIL Open Font License 1.1. Preserve the bundled OFL notices.
- Generated or user-supplied assets are not automatically covered by the project license. Their Asset Catalog status remains `unknown` until evidence is supplied.

## Installed dependencies

Dependencies fetched by `npm ci` retain their own terms. In particular:

- Remotion uses the Remotion License, not MIT. As of this release, individuals, nonprofits and organizations of up to three people may qualify for the free license; other organizations and some automation use cases require a company license. Consult the current official Remotion license before use.
- GSAP uses the GreenSock standard license.
- React, Three.js and many related packages use permissive licenses; TypeScript is Apache-2.0; postprocessing uses zlib.

## External optional tools

FFmpeg licensing depends on the chosen build and enabled codecs. Blender is GPL. whisper.cpp is MIT; model licenses vary. These tools and models are not bundled in release archives.

## Exclusions

No code from the unlicensed root of `majed-plugins` is included. Paid fal.ai integrations, social publishing, promotional/affiliate content, unsafe update scripts, CapCut internal manipulation and private media/projects are excluded.

For file-level details, read `THIRD_PARTY_NOTICES.md`, font license files and dependency license files after installation.
