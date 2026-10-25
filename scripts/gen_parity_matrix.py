#!/usr/bin/env python3
"""Single source for the Majed feature-parity matrix. Writes docs/majed/parity-matrix.json and parity-matrix.md.

    python3 scripts/gen_parity_matrix.py          # regenerate
    python3 scripts/gen_parity_matrix.py --check  # fail if the files are stale

Statuses: integrated (works as upstream intends), adapted (HASKA-native re-implementation of the capability),
platform-optional (needs an OS/tool this machine lacks; HASKA accepts the input another way), blocked (needs approval,
a paid service or a download), unavailable (not provided, by design or because upstream cannot run here).
`evidence` entries are repository paths (must exist) or the exact command that verifies the claim.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATUSES = ["integrated", "adapted", "platform-optional", "blocked", "unavailable"]

R = lambda cid, name, ar, status, evidence, reason, verified: dict(id=cid, capability=name, arabic=ar, status=status, evidence=evidence, reason=reason, verified=verified)

ROWS = [
    # --- the 17 requested capability groups
    R("arabic-ad-editing", "Arabic video ad editing", "مونتاج إعلانات فيديو بالعربية", "adapted",
      [".agents/skills/haska-video/modes/motion-bank.md", "src/majed/TalkingHeadReel.tsx", "scripts/media_tools.py", "tests/production/majed-timeline.test.ts"],
      "Upstream is a Claude-skill workflow over its own Chrome+ffmpeg renderer; HASKA keeps Remotion as master timeline and routes requests through the haska-video skill.", "frame-level stills + unit tests; no real footage"),
    R("motion-video-generation", "Motion-video generation", "توليد فيديو موشن", "adapted",
      ["src/majed/MoveShowcase.tsx", "src/production/render/ProductionVideo.tsx", "production/reports/moves-smoke.json"],
      "Motion is generated as deterministic Remotion compositions. Upstream's generative-AI scenes (fal.ai) are a separate paid service: see 'ai-scene-generation'.", "97/97 drawable moves rendered as stills"),
    R("motion-preset-library", "Motion preset library (100 moves)", "مكتبة الحركات", "integrated",
      ["third_party/majed-video/motion/moves.js", "src/majed/catalog.ts", "src/majed/context.ts", "production/reports/moves-smoke.json", "production/reports/video-moves-smoke.json"],
      "All 100 catalog entries are vendored; 97 draw; jcut, matchCut and ramp are timing rules (no drawing in upstream either). Footage moves verified with a synthetic clip; craneUp draws but its use of the footage was not confirmed.", "scripts/smoke_moves.mjs, scripts/smoke_video_moves.mjs"),
    R("visual-style-library", "Visual style library (17 styles)", "مكتبة الستايلات البصرية", "adapted",
      ["third_party/majed-video/motion/styles.js", "scripts/derive_majed_styles.mjs", "production/style-profiles/majed-keynote.json"],
      "Colours, fonts and personality become StyleProfiles (validated). Upstream per-style post effects (grain, vignette, card/label variants) are kept only as metadata in extensions['majed-video'].", "npm run production -- validate"),
    R("arabic-kinetic-typography", "Arabic kinetic typography", "تايبوغرافي عربي متحرك", "integrated",
      ["src/majed/engine-core.js", "scripts/derive_majed_engine.py", "src/typography/kinetic.ts"],
      "Upstream Arabic text engine (word layout, kashida, joining, digits) is derived byte-for-byte; HASKA's own word-level kinetic planner is unchanged.", "stills of text moves reviewed visually; python3 scripts/derive_majed_engine.py --check"),
    R("text-behind-subject", "Text behind the subject", "نص خلف الشخص", "platform-optional",
      ["src/majed/TextBehindSubject.tsx", ".agents/skills/haska-video/modes/text-behind-subject.md", "scripts/smoke_majed_features.mjs"],
      "Compositing works with any matte (verified with a green-screen fixture). Automatic person matte uses macOS Vision in upstream and is not available on Linux/Windows; supply a matte or use green screen.", "pixel check on a synthetic green-screen clip"),
    R("podcast-to-reels", "Podcast to Reels", "من بودكاست إلى ريلز", "adapted",
      [".agents/skills/haska-video/modes/podcast.md", "scripts/cutplan.py", "src/majed/TalkingHeadReel.tsx"],
      "Moment selection is done by Claude from the transcript; cuts and captions use the cut-plan tools. Speaker/face tracking for multi-cam is macOS-only upstream and is not automated.", "tools + composition verified on synthetic media"),
    R("montage-rhythm", "Montage and rhythm editing", "مونتاج إيقاعي", "adapted",
      ["src/majed/montage.ts", "src/majed/MontageReel.tsx", "scripts/media_tools.py", "tests/production/majed-timeline.test.ts"],
      "Beat detection is HASKA's own numpy implementation (about 1% tempo error and about 30 ms beat error on a synthetic click track; not compared with upstream beat.py and not tested on real music).", "click-track test + frame check"),
    R("silence-and-text-cuts", "Silence removal and text-based cuts", "حذف الصمت والقص بالنص", "adapted",
      ["scripts/cutplan.py", "scripts/media_tools.py", "src/majed/timeline.ts"],
      "Silence plan, drop/keep/undo by phrase or word range, caption remap. Cut spans are pure data shared by Python and the composition.", "python + TS unit tests, frame check"),
    R("narration-driven-motion", "Motion driven by narration meaning", "حركة مبنية على معنى الكلام", "integrated",
      [".claude/commands/audio-to-motion.md", "src/audio/AudioExplainer.tsx", "scripts/audio_motion.py"],
      "Already native to HASKA's Audio-to-Motion (transcript to reviewed semantic storyboard); the Majed move bank is now available to those scenes. Upstream's SigLIP2 shot search needs a model download: see 'shot-search'.", "existing Audio-to-Motion tests (reel project untouched)"),
    R("one-shot-transitions", "One-shot transitions / continuous camera", "انتقالات اللقطة الواحدة", "adapted",
      ["src/majed/catalog.ts", "src/motion/CameraRig.tsx", "third_party/majed-video/motion/examples/one-take/project.json"],
      "The 20 transition moves (craneUp, swishSettle, punchCut, ...) and HASKA's CameraRig cover it. Upstream's multi-scene one-take project runtime is not ported; its example is vendored for reference.", "transition moves in moves-smoke.json"),
    R("cover-thumbnail", "Cover and thumbnail generation", "غلاف وصورة مصغّرة", "adapted",
      ["src/majed/CoverStill.tsx", "src/majed/cover-rules.ts", "tests/production/majed-timeline.test.ts"],
      "CoverReel / CoverYouTube stills with the upstream size and safe-area rules as checkable code. Upstream's multi-variant generator and phone-preview grid are not ported.", "layout rules tested; stills rendered with rule report"),
    R("editable-timeline", "Editable timeline", "تايم لاين قابل للتعديل", "adapted",
      ["src/root.tsx", "src/production/shot-graph.ts", "scripts/cutplan.py"],
      "Remotion Studio plus ShotGraph/cut-plan JSON are the editable timeline. Upstream's local review web page (studio.py HTTP server) is deliberately not ported.", "Studio compositions listed (npm run compositions)"),
    R("website-product-explainer", "Website and product explainers", "شرح المواقع والمنتجات", "adapted",
      ["scripts/web_capture.mjs", ".agents/skills/haska-video/modes/explainer.md"],
      "Page capture uses the machine's own Chromium/Chrome/Edge on request; device framing via moves. Upstream's puppeteer-core capture and 3D device scene scripts are not used.", "captured a local test page"),
    R("reference-styling", "Reference-based styling", "ستايل مبني على مرجع", "adapted",
      ["scripts/media_tools.py", ".agents/skills/haska-video/modes/reference-style.md"],
      "Palette extraction from a reference image into a StyleProfile only (fixed seed). Typography and pacing from references remain a manual judgement.", "palette command run on a synthetic image"),
    R("sound-finishing", "Sound design and finishing", "تصميم الصوت واللمسات الأخيرة", "adapted",
      ["scripts/media_tools.py", "scripts/sound_design.py", ".agents/skills/haska-video/modes/finish-and-interop.md"],
      "Two-pass -14 LUFS master, enhance chain (high-pass, afftdn, compressor) and picture scope check with FFmpeg. Upstream's deep-filter binary download is not used. Results judged by measurement, not by ear.", "master/check run on synthetic media"),
    R("editor-interop", "CapCut / DaVinci interoperability", "التوافق مع كاب كات ودافنشي", "adapted",
      ["scripts/media_tools.py", ".agents/skills/haska-video/modes/finish-and-interop.md"],
      "CMX3600 EDL and OpenTimelineIO export of the cut plan. Not verified inside DaVinci/Premiere/CapCut (none installed). See rows 'capcut-export' and 'davinci-scripting'.", "files generated and parsed; not opened in an editor"),
    # --- sub-features that are not fully available
    R("person-matte-macos", "Automatic person matte (Vision)", "قص الشخص تلقائيا", "platform-optional", ["third_party/majed-video/macos/personmask.swift"], "Swift/Vision requires macOS. HASKA accepts an externally supplied matte or a green-screen key.", "not run"),
    R("face-hand-tracking", "Face and hand tracking moves", "تتبع الوجه واليد", "platform-optional", ["third_party/majed-video/macos/facetrack.swift", "third_party/majed-video/macos/handpose.swift"], "macOS Vision only. The affected moves (85, 86, 89, 91) fall back to their static positions.", "not run"),
    R("hdr-to-sdr", "HDR to SDR conversion", "تحويل HDR", "platform-optional", ["third_party/majed-video/macos/hdr2sdr.swift"], "macOS tool. FFmpeg zscale/tonemap can do it but was not integrated or tested.", "not run"),
    R("ai-scene-generation", "Generative AI scenes (fal.ai)", "توليد مشاهد بالذكاء الاصطناعي", "blocked", [], "Paid cloud service with an API key (FAL_KEY). Not added without explicit approval.", "not run"),
    R("avatar-scene", "Talking-avatar scene", "مشهد أفاتار ناطق", "blocked", [], "Uses the same paid cloud generator.", "not run"),
    R("shot-search", "Semantic shot search (SigLIP2)", "بحث اللقطات بالمعنى", "blocked", [], "Needs a multi-hundred-MB model download and PyTorch; requires approval before download.", "not run"),
    R("quran-api", "Quran verse fetch", "جلب الآيات", "unavailable", [], "Fetches from a web API; HASKA stays local-only. Rule kept: never type Quran text from memory; the user supplies a verified source.", "not run"),
    R("capcut-export", "CapCut draft export", "تصدير مسودة كاب كات", "blocked", [], "Upstream writes undocumented CapCut draft files using exec() on sliced source; not vendored. Use EDL or the rendered MP4.", "not run"),
    R("davinci-scripting", "DaVinci Resolve scripting (majed-davinci)", "سكربت دافنشي", "unavailable", [], "Drives Resolve Studio 21.1 on macOS via its scripting API; cannot run on this machine.", "not run"),
    R("video-ad-editor-setup-update", "Upstream installer and auto-update", "التثبيت والتحديث التلقائي", "unavailable", ["third_party/majed-video/UPSTREAM.json"], "Removed on purpose: it silently checks GitHub, overwrites its own folder with rsync --delete, and runs sudo/curl installers. HASKA pins commits and never auto-updates.", "audit only"),
    R("promotional-footers", "Course/affiliate promotion instructions", "الإعلانات الترويجية", "unavailable", ["docs/majed/AUDIT.md"], "Upstream instructions tell the assistant to append promotions to deliveries; HASKA does not follow them.", "audit only"),
    R("content-engine-publishing", "Social publishing (majed-plugins/content-engine)", "النشر الاجتماعي", "unavailable", [], "No licence in that repository and it publishes through a cloud service.", "not vendored"),
    R("upstream-review-server", "Upstream local review server (studio.py)", "خادم المراجعة المحلي", "unavailable", [], "Replaced by Remotion Studio; avoids a second local HTTP server.", "not ported"),
]


def build() -> dict:
    counts = {s: sum(1 for r in ROWS if r["status"] == s) for s in STATUSES}
    return {"schemaVersion": 1, "upstream": {"video-ad-editor": "886cae69add821367f6c7bb9d9115a34e2427b21", "majed-plugins": "22ae9594fde716178602fae728a9d73a3b56406d", "majed-davinci": "331ea9db729e636c2fc80e1450552b7994a9afb3"}, "statuses": STATUSES, "counts": counts, "rows": ROWS}


def markdown(data: dict) -> str:
    lines = ["# Majed Video → HASKA feature parity", "", "Generated by `scripts/gen_parity_matrix.py` from the single source in that file. Do not edit by hand.", "",
             "Pinned upstream commits: " + ", ".join(f"`{k}` @ `{v[:10]}`" for k, v in data["upstream"].items()), "",
             "Counts: " + ", ".join(f"{k} {v}" for k, v in data["counts"].items()), "", "| Capability | Status | Evidence | Reason | Verified how |", "| --- | --- | --- | --- | --- |"]
    for r in data["rows"]:
        evidence = "<br>".join(f"`{e}`" for e in r["evidence"]) or "—"
        lines.append(f"| {r['capability']} ({r['arabic']}) | **{r['status']}** | {evidence} | {r['reason']} | {r['verified']} |")
    lines += ["", "Status meanings: integrated = works as upstream intends; adapted = HASKA-native re-implementation; platform-optional = needs an OS/tool not present here, other input accepted; blocked = needs approval / paid service / download; unavailable = not provided (by design or cannot run here).", ""]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build()
    outputs = {ROOT / "docs/majed/parity-matrix.json": json.dumps(data, ensure_ascii=False, indent=2) + "\n", ROOT / "docs/majed/parity-matrix.md": markdown(data)}
    if args.check:
        stale = [p.name for p, t in outputs.items() if not p.is_file() or p.read_text(encoding="utf-8") != t]
        print("parity matrix is stale: " + ", ".join(stale) if stale else "parity matrix is up to date")
        return 1 if stale else 0
    for path, text in outputs.items():
        path.write_text(text, encoding="utf-8")
    print(f"wrote {len(ROWS)} rows: {data['counts']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
