#!/usr/bin/env python3
"""Local audio-to-motion project manager. Uses only the Python standard library."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from platform_util import FFMPEG, FFPROBE, NODE, find_tool, is_executable, nvidia_available  # noqa: E402
PUBLIC = ROOT / "public" / "audio-projects"
ACTIVE = ROOT / "src" / "data" / "active-audio-project.json"
WHISPER = find_tool("whisper-cli")
MODEL_DIR = ROOT / "tools" / "whisper-models"
ALLOWED_EXTENSIONS = {".mp3", ".m4a", ".wav"}
MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024
RTL_RE = re.compile(r"[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]")


class WorkflowError(RuntimeError):
    pass


def run(command: list[str], *, capture: bool = False, cwd: Path = ROOT) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise WorkflowError(f"Cannot read valid JSON from {path}: {error}") from error


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    temporary.replace(path)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug or len(slug) > 64:
        raise WorkflowError("Project name must contain Latin letters or numbers and be at most 64 slug characters.")
    return slug


def project_dir(project_id: str) -> Path:
    clean = slugify(project_id)
    path = (PUBLIC / clean).resolve()
    if PUBLIC.resolve() not in path.parents:
        raise WorkflowError("Project path escaped the local audio workspace.")
    return path


def probe_audio(path: Path) -> dict[str, Any]:
    result = run([
        FFPROBE, "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,sample_rate,channels:format=duration,size",
        "-of", "json", str(path),
    ], capture=True)
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    if not streams:
        raise WorkflowError("The selected file contains no readable audio stream.")
    duration = float(data.get("format", {}).get("duration", 0))
    if not math.isfinite(duration) or duration <= 0:
        raise WorkflowError("The selected audio has no valid positive duration.")
    return {"durationMs": round(duration * 1000), "stream": streams[0]}


def direction_for(text: str, language: str) -> str:
    if language == "ar":
        return "rtl"
    chars = [char for char in text if char.isalpha()]
    return "rtl" if chars and sum(bool(RTL_RE.search(char)) for char in chars) > len(chars) / 2 else "ltr"


def empty_transcript(language: str, duration_ms: int) -> dict[str, Any]:
    return {
        "schemaVersion": 1,
        "language": language,
        "direction": "rtl" if language == "ar" else "ltr",
        "durationMs": duration_ms,
        "corrected": False,
        "segments": [],
    }


def cmd_import(args: argparse.Namespace) -> None:
    source = Path(args.audio).expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise WorkflowError("Input must be a regular MP3, M4A, or WAV file.")
    if source.stat().st_size > MAX_INPUT_BYTES:
        raise WorkflowError("Input exceeds the 2 GiB local safety limit.")
    project_id = slugify(args.name or source.stem)
    destination = project_dir(project_id)
    if destination.exists() and any(destination.iterdir()) and not args.replace:
        raise WorkflowError(f"Project '{project_id}' already exists. Use --replace only if you intend to update it.")
    destination.mkdir(parents=True, exist_ok=True)

    source_copy = destination / f"source{source.suffix.lower()}"
    shutil.copy2(source, source_copy)
    source_metadata = probe_audio(source_copy)
    normalized = destination / "narration.wav"
    run([
        FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source_copy), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "pcm_s16le", str(normalized),
    ])
    transcription_metadata = probe_audio(normalized)
    transcript = empty_transcript(args.language, source_metadata["durationMs"])
    write_json(destination / "transcript.json", transcript)
    write_json(destination / "source.json", {
        "schemaVersion": 1,
        "id": project_id,
        "title": args.title or project_id.replace("-", " ").title(),
        "language": args.language,
        "sourceFile": source_copy.name,
        "normalizedFile": normalized.name,
        "durationMs": source_metadata["durationMs"],
        "audio": source_metadata["stream"],
        "transcriptionAudio": transcription_metadata["stream"],
    })
    make_storyboard(project_id)
    activate(project_id)
    print(f"Imported securely: {normalized}")
    print(f"Duration: {source_metadata['durationMs'] / 1000:.3f}s; project: {project_id}")


def model_path(model: str) -> Path:
    path = MODEL_DIR / f"ggml-{model}.bin"
    if not path.is_file():
        raise WorkflowError(f"Whisper model is missing: {path}\nRun ./scripts/install-whisper.sh first.")
    return path


def to_words(tokens: list[dict[str, Any]], segment_start: int, segment_end: int, fallback_text: str) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    usable = []
    for token in tokens:
        text = str(token.get("text", ""))
        offsets = token.get("offsets", {})
        if not text or text.startswith("[") or "[_" in text:
            continue
        start = int(offsets.get("from", segment_start))
        end = int(offsets.get("to", max(start + 1, segment_end)))
        usable.append((text, start, end, token.get("p")))

    for text, start, end, probability in usable:
        begins_word = bool(text[:1].isspace())
        stripped = text.strip()
        punctuation = bool(stripped and re.fullmatch(r"[^\w\u0600-\u06ff]+", stripped, re.UNICODE))
        if current is None or (begins_word and not punctuation):
            if current is not None and current["text"]:
                merged.append(current)
            current = {
                "text": stripped,
                "startMs": start,
                "endMs": max(start + 1, end),
                "timestampMs": start,
                "confidence": float(probability) if probability is not None else None,
            }
        elif current is not None:
            current["text"] += stripped if punctuation else text
            current["endMs"] = max(current["endMs"], end)
            if probability is not None and current["confidence"] is not None:
                current["confidence"] = min(current["confidence"], float(probability))
    if current is not None and current["text"]:
        merged.append(current)

    if merged:
        return merged
    words = fallback_text.split()
    if not words:
        return []
    span = max(1, segment_end - segment_start)
    return [{
        "text": word,
        "startMs": round(segment_start + span * index / len(words)),
        "endMs": round(segment_start + span * (index + 1) / len(words)),
        "timestampMs": round(segment_start + span * index / len(words)),
        "confidence": None,
    } for index, word in enumerate(words)]


def parse_whisper(raw: dict[str, Any], duration_ms: int, requested_language: str) -> dict[str, Any]:
    language = str(raw.get("result", {}).get("language") or requested_language)
    segments = []
    for index, item in enumerate(raw.get("transcription", []), start=1):
        offsets = item.get("offsets", {})
        start = max(0, int(offsets.get("from", 0)))
        end = min(duration_ms, max(start + 1, int(offsets.get("to", duration_ms))))
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        words = to_words(item.get("tokens", []), start, end, text)
        confidence_values = [word["confidence"] for word in words if word["confidence"] is not None]
        segments.append({
            "id": f"segment-{index:03d}",
            "startMs": start,
            "endMs": end,
            "text": text,
            "words": words,
            "confidence": sum(confidence_values) / len(confidence_values) if confidence_values else None,
        })
    full_text = " ".join(segment["text"] for segment in segments)
    return {
        "schemaVersion": 1,
        "language": language,
        "direction": direction_for(full_text, language),
        "durationMs": duration_ms,
        "corrected": False,
        "segments": segments,
    }


def cmd_transcribe(args: argparse.Namespace) -> None:
    destination = project_dir(args.project)
    source = load_json(destination / "source.json")
    audio = destination / "narration.wav"
    if not is_executable(WHISPER):
        raise WorkflowError("Project-local whisper.cpp is not installed. Run ./scripts/install-whisper.sh.")
    language = args.language or source.get("language", "auto")
    output_prefix = destination / "whisper-raw"
    threads = args.threads or max(2, min(16, (os.cpu_count() or 4) // 2))
    command = [
        str(WHISPER), "-m", str(model_path(args.model)), "-f", str(audio),
        "-l", language, "-t", str(threads), "-ojf", "-of", str(output_prefix),
        "-sow", "-np",
    ]
    run(command)
    raw_path = output_prefix.with_suffix(".json")
    raw = load_json(raw_path)
    transcript = parse_whisper(raw, int(source["durationMs"]), language)
    if not transcript["segments"]:
        raise WorkflowError("Whisper produced no speech segments. Check the input and language selection.")
    write_json(destination / "transcript.json", transcript)
    make_storyboard(args.project)
    activate(args.project)
    print(f"Transcript: {destination / 'transcript.json'}")
    print(f"Language: {transcript['language']}; segments: {len(transcript['segments'])}; correction status: required review")


def choose_visual(text: str) -> tuple[str, str]:
    lowered = text.lower()
    if re.search(r"\d|percent|percentage|بالمئة|نسبة", lowered):
        return "metric", "A quantified claim is the focal object; verify the number against narration."
    if re.search(r"security|secure|protect|threat|attack|أمن|حماية|تهديد|هجوم", lowered):
        return "shield", "Protection and threat language maps to an abstract defensive boundary."
    if re.search(r"network|signal|connect|data|شبكة|إشارة|بيانات|اتصال", lowered):
        return "network", "Connections and information flow map to a node topology."
    if re.search(r"step|process|first|then|workflow|خطوة|عملية|أولاً|ثم", lowered):
        return "process", "Sequential language maps to a staged process diagram."
    if re.search(r"together|community|country|give|share|معاً|مجتمع|وطن|شارك", lowered):
        return "reciprocity", "The narration describes a relationship between people and a larger group."
    return "editorial", "No unsupported literal object is assumed; typography carries the verified narration."


def make_storyboard(project_id: str) -> dict[str, Any]:
    destination = project_dir(project_id)
    source = load_json(destination / "source.json")
    transcript = load_json(destination / "transcript.json")
    transcript_segments = transcript.get("segments", [])
    scenes = []
    for index, segment in enumerate(transcript_segments):
        text = str(segment["text"]).strip()
        words = text.split()
        visual_kind, rationale = choose_visual(text)
        scenes.append({
            "id": f"scene-{index + 1:02d}",
            "startMs": int(segment["startMs"]),
            "endMs": int(segment["endMs"]),
            "narration": text,
            "onScreenText": " ".join(words[:9]),
            "visualKind": visual_kind,
            "animation": "Primary visual resolves with eased spatial motion; supporting geometry follows; ambient grid remains restrained.",
            "visualAssetRequirements": [],
            "semanticRationale": rationale,
            "status": "draft",
        })
    if not scenes:
        scenes = [{
            "id": "scene-01", "startMs": 0, "endMs": int(source["durationMs"]),
            "narration": "", "onScreenText": "TRANSCRIPT REQUIRED", "visualKind": "signal",
            "animation": "Signal waits for a verified transcript.", "visualAssetRequirements": [],
            "semanticRationale": "Placeholder only; do not treat as a semantic storyboard.", "status": "draft",
        }]
    storyboard = {
        "schemaVersion": 1,
        "title": source["title"],
        "language": transcript.get("language", source["language"]),
        "durationMs": int(source["durationMs"]),
        "scenes": scenes,
    }
    write_json(destination / "storyboard.json", storyboard)
    return storyboard


def validate_data(project_id: str) -> list[str]:
    destination = project_dir(project_id)
    source = load_json(destination / "source.json")
    transcript = load_json(destination / "transcript.json")
    storyboard = load_json(destination / "storyboard.json")
    duration = int(source["durationMs"])
    errors = []
    for label, items in (("transcript", transcript.get("segments", [])), ("storyboard", storyboard.get("scenes", []))):
        previous = 0
        for index, item in enumerate(items):
            start, end = int(item.get("startMs", -1)), int(item.get("endMs", -1))
            if start < 0 or end <= start or end > duration + 100:
                errors.append(f"{label}[{index}] has invalid bounds {start}..{end} for {duration}ms")
            if start < previous:
                errors.append(f"{label}[{index}] overlaps or is out of order")
            previous = end
    for segment_index, segment in enumerate(transcript.get("segments", [])):
        previous = int(segment["startMs"])
        for word_index, word in enumerate(segment.get("words", [])):
            start, end = int(word["startMs"]), int(word["endMs"])
            if start < int(segment["startMs"]) or end > int(segment["endMs"]) + 100 or end <= start:
                errors.append(f"segment {segment_index} word {word_index} has invalid timing")
            if start < previous:
                errors.append(f"segment {segment_index} word {word_index} is out of order")
            previous = end
    return errors


def activate(project_id: str) -> dict[str, Any]:
    destination = project_dir(project_id)
    errors = validate_data(project_id)
    if errors:
        raise WorkflowError("Cannot activate invalid data:\n- " + "\n- ".join(errors))
    source = load_json(destination / "source.json")
    transcript = load_json(destination / "transcript.json")
    storyboard = load_json(destination / "storyboard.json")
    # Optional per-project settings.json: {"fps": 60, "displayWaveform": false, "styleProfileId": "...", "presets": ["reel"]}.
    # "presets" only narrows what QA checks and what render-audio.sh accepts; it never changes the composition.
    settings_path = destination / "settings.json"
    settings = load_json(settings_path) if settings_path.is_file() else {}
    fps = int(settings.get("fps", 30))
    if fps not in (24, 25, 30, 50, 60):
        raise WorkflowError(f"settings.json fps must be one of 24, 25, 30, 50, 60 (got {fps}).")
    manifest = {
        "schemaVersion": 1,
        "id": source["id"],
        "title": source["title"],
        "language": transcript["language"],
        "direction": transcript["direction"],
        "audioFile": f"audio-projects/{source['id']}/{source['sourceFile']}",
        "durationMs": int(source["durationMs"]),
        "fps": fps,
        "displayWaveform": bool(settings.get("displayWaveform", True)),
        "transcript": transcript,
        "storyboard": storyboard,
    }
    if "narrationVolume" in settings:
        volume = float(settings["narrationVolume"])
        if not 0.1 <= volume <= 1.0:
            raise WorkflowError("settings.json narrationVolume must be between 0.1 and 1.0.")
        manifest["narrationVolume"] = volume
    tracks = []
    for track in settings.get("soundtrack", []):
        rel = str(track["file"])
        if rel.startswith("/") or ".." in rel.split("/"):
            raise WorkflowError(f"soundtrack file {rel!r} must be relative to the project folder.")
        if not (destination / rel).is_file():
            raise WorkflowError(f"soundtrack file {rel!r} is missing. Run: python3 scripts/sound_design.py {source['id']}")
        tracks.append({"name": str(track.get("name", rel)), "file": f"audio-projects/{source['id']}/{rel}", "volume": float(track.get("volume", 1.0))})
    if tracks:
        manifest["soundtrack"] = tracks
    if "showLabel" in settings:
        manifest["showLabel"] = bool(settings["showLabel"])
    if settings.get("styleProfileId"):
        manifest["styleProfileId"] = str(settings["styleProfileId"])
    write_json(destination / "project.json", manifest)
    write_json(ACTIVE, manifest)
    return manifest


def cmd_activate(args: argparse.Namespace) -> None:
    manifest = activate(args.project)
    print(f"Active project: {manifest['id']} ({manifest['durationMs'] / 1000:.3f}s)")


def cmd_plan(args: argparse.Namespace) -> None:
    storyboard = make_storyboard(args.project)
    activate(args.project)
    print(f"Draft storyboard: {project_dir(args.project) / 'storyboard.json'}")
    print(f"Scenes: {len(storyboard['scenes'])}. Claude Code must review semantic choices before delivery.")


def cmd_validate(args: argparse.Namespace) -> None:
    errors = validate_data(args.project)
    if errors:
        raise WorkflowError("Validation failed:\n- " + "\n- ".join(errors))
    print(f"PASS: transcript and storyboard timing are valid for '{slugify(args.project)}'.")


def gate_approval(project_id: str) -> None:
    """Refuse a final render when the storyboard's approval record is not current (docs/production-foundation.md)."""
    command = ["node", str(ROOT / "scripts" / "ts-run.mjs"), "cli", "gate", "storyboard", slugify(project_id)]
    if subprocess.run(command, cwd=ROOT).returncode != 0:
        raise WorkflowError("Final render blocked: the storyboard is not approved for its current content.")


def check_preset_allowed(project_id: str, preset: str) -> None:
    settings_path = project_dir(project_id) / "settings.json"
    allowed = load_json(settings_path).get("presets") if settings_path.is_file() else None
    if allowed and preset not in allowed:
        raise WorkflowError(f"Project '{project_id}' is designed for {', '.join(allowed)} only; its scenes do not fit '{preset}'.")


def render(project_id: str, preset: str, output: str | None) -> Path:
    check_preset_allowed(project_id, preset)
    gate_approval(project_id)
    manifest = activate(project_id)
    composition = {"youtube": "AudioExplainerYouTube", "reel": "AudioExplainerReel", "tiktok": "AudioExplainerTikTok"}[preset]
    target = Path(output).expanduser().resolve() if output else ROOT / "out" / f"{manifest['id']}-{preset}.mp4"
    target.parent.mkdir(parents=True, exist_ok=True)
    command = [
        NODE, str(ROOT / "scripts" / "studio.mjs"), "render", "src/index.ts", composition, str(target),
        "--codec=h264", "--audio-codec=aac", "--color-space=bt709", "--concurrency=50%",
    ]
    gpu_available = nvidia_available()
    command.extend(["--video-bitrate=12M", "--hardware-acceleration=if-possible"] if gpu_available else ["--crf=18", "--hardware-acceleration=disable"])
    run(command)
    probe = run([
        FFPROBE, "-v", "error", "-show_entries",
        "format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate",
        "-of", "json", str(target),
    ], capture=True)
    details = json.loads(probe.stdout)
    streams = details.get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    expected = (1920, 1080) if preset == "youtube" else (1080, 1920)
    actual_duration = float(details.get("format", {}).get("duration", 0))
    expected_duration = manifest["durationMs"] / 1000
    if not target.is_file() or target.stat().st_size == 0:
        raise WorkflowError("Render did not create a non-empty output file.")
    if not video or video.get("codec_name") != "h264" or (video.get("width"), video.get("height")) != expected:
        raise WorkflowError(f"Unexpected video stream: {video}")
    if not audio:
        raise WorkflowError("Rendered MP4 has no narration audio stream.")
    if abs(actual_duration - expected_duration) > max(0.12, 1 / 30):
        raise WorkflowError(f"Duration mismatch: expected {expected_duration:.3f}s, got {actual_duration:.3f}s")
    print(f"Verified MP4: {target}")
    print(f"H.264 {expected[0]}x{expected[1]}, narration codec {audio.get('codec_name')}, duration {actual_duration:.3f}s")
    return target


def cmd_render(args: argparse.Namespace) -> None:
    render(args.project, args.preset, args.output)


def cmd_preview(args: argparse.Namespace) -> None:
    activate(args.project)
    os.execv(NODE, [NODE, str(ROOT / "scripts" / "studio.mjs")])


def cmd_sample(args: argparse.Namespace) -> None:
    sample_dir = ROOT / "fixtures"
    sample_dir.mkdir(parents=True, exist_ok=True)
    sample = sample_dir / "cybersecurity-voice.wav"
    run([
        FFMPEG, "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
        "-i", "flite=text='Protect every signal. Detect the threat. Respond with confidence.':voice=slt",
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(sample),
    ])
    imported = argparse.Namespace(audio=str(sample), name="audio-motion-sample", title="Signal Defense", language="en", replace=True)
    cmd_import(imported)
    transcribed = argparse.Namespace(project="audio-motion-sample", language="en", model="small", threads=None)
    cmd_transcribe(transcribed)
    print("Sample audio-to-motion data is active.")
    if args.render:
        render("audio-motion-sample", args.preset, None)


def cmd_doctor(_: argparse.Namespace) -> None:
    checks = {
        "ffmpeg": shutil.which(FFMPEG) or (FFMPEG if Path(FFMPEG).is_file() else None),
        "ffprobe": shutil.which(FFPROBE) or (FFPROBE if Path(FFPROBE).is_file() else None),
        "node": shutil.which("node"),
        "Remotion": (ROOT / "node_modules" / ".bin" / "remotion") if (ROOT / "node_modules" / ".bin" / "remotion").is_file() else None,
        "whisper.cpp": WHISPER if WHISPER.is_file() else None,
        "small multilingual model": MODEL_DIR / "ggml-small.bin" if (MODEL_DIR / "ggml-small.bin").is_file() else None,
    }
    failed = False
    for name, value in checks.items():
        status = "PASS" if value else "FAIL"
        failed = failed or not bool(value)
        print(f"{status:4}  {name}: {value or 'missing'}")
    if failed:
        raise WorkflowError("One or more required local components are missing.")


def parser() -> argparse.ArgumentParser:
    top = argparse.ArgumentParser(prog="audio-motion", description="Secure local audio-to-motion workflow")
    commands = top.add_subparsers(dest="command", required=True)
    imported = commands.add_parser("import", help="validate and normalize MP3, M4A, or WAV")
    imported.add_argument("audio")
    imported.add_argument("--name")
    imported.add_argument("--title")
    imported.add_argument("--language", choices=("ar", "en", "auto"), default="auto")
    imported.add_argument("--replace", action="store_true")
    imported.set_defaults(func=cmd_import)
    transcribe = commands.add_parser("transcribe", help="transcribe locally with whisper.cpp")
    transcribe.add_argument("project")
    transcribe.add_argument("--language", choices=("ar", "en", "auto"))
    transcribe.add_argument("--model", default="small")
    transcribe.add_argument("--threads", type=int)
    transcribe.set_defaults(func=cmd_transcribe)
    plan = commands.add_parser("plan", help="regenerate a draft machine-readable storyboard")
    plan.add_argument("project")
    plan.set_defaults(func=cmd_plan)
    activate_parser = commands.add_parser("activate", help="select an audio project for Studio")
    activate_parser.add_argument("project")
    activate_parser.set_defaults(func=cmd_activate)
    validate = commands.add_parser("validate", help="validate corrected transcript and storyboard timing")
    validate.add_argument("project")
    validate.set_defaults(func=cmd_validate)
    render_parser = commands.add_parser("render", help="render and ffprobe-validate an H.264 MP4")
    render_parser.add_argument("project")
    render_parser.add_argument("--preset", choices=("youtube", "reel", "tiktok"), default="youtube")
    render_parser.add_argument("--output")
    render_parser.set_defaults(func=cmd_render)
    preview = commands.add_parser("preview", help="activate a project and launch local Remotion Studio")
    preview.add_argument("project")
    preview.set_defaults(func=cmd_preview)
    sample = commands.add_parser("sample", help="create, transcribe, and optionally render a short local test")
    sample.add_argument("--render", action="store_true")
    sample.add_argument("--preset", choices=("youtube", "reel", "tiktok"), default="youtube")
    sample.set_defaults(func=cmd_sample)
    doctor = commands.add_parser("doctor", help="check local workflow dependencies")
    doctor.set_defaults(func=cmd_doctor)
    return top


def main() -> int:
    try:
        args = parser().parse_args()
        args.func(args)
        return 0
    except (WorkflowError, subprocess.CalledProcessError, FileNotFoundError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
