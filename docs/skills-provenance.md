# Agent Skills Provenance

All skills are project-scoped under `.agents/skills`. Claude Code reads the same directory through `.claude/skills`; no global agent configuration was changed.

## Installed

| Source | Reviewed revision | Installed content | License / notes |
|---|---|---|---|
| `remotion-dev/skills` | `6c67adcd9cdbe6eb84d76342da89b225f9161cb2` | 12 Remotion skills, version 4.0.538 | Official Remotion skill content. Installed with the Codex skill installer from the pinned revision. |
| `LottieFiles/motion-design-skill` | `f9a8a041b85185ee4881b3471d3415e939aac772` | `motion-design` | MIT. Installed with the Codex skill installer from the pinned revision. |

The repositories were shallow-cloned to `/tmp` first. Package manifests, skill entry files, installer behavior, and potentially sensitive/destructive command patterns were inspected before installation.

## Reviewed but not installed

`motiondivision/ai-kit` revision `0ebeb5313a069986376430f665415252e223d1d4` was reviewed and intentionally skipped. Its interactive installer copies separate skill trees into agent-specific folders and automatically adds hosted `mcp.motion.dev` servers to Claude/Codex configuration. That behavior is unnecessary for this local Remotion/GSAP project and would broaden network and configuration scope.
