#!/usr/bin/env python3
"""Local media utilities behind HASKA's video skills (all offline, ffmpeg + numpy only; Linux/Windows/macOS).

  silence  VIDEO PLAN.json [--noise -35] [--min 0.45] [--pad 0.08]       cut plan that removes silences
  textcut  PLAN.json TRANSCRIPT.json (--drop "phrase" | --keep "phrase" | --drop-range I J | --undo)
  captions PLAN.json TRANSCRIPT.json OUT.json                            transcript retimed to the edited timeline
  beats    AUDIO OUT.json                                                tempo + beat grid (spectral-flux onsets)
  palette  IMAGE OUT.json [--id ID] [--name NAME]                        StyleProfile derived from a reference image
  matte    VIDEO OUT.mp4 --key 0x00ff00 [--similarity .18] [--blend .08] green/blue-screen subject matte (alpha preview)
  master   INPUT OUT [--lufs -14] [--tp -1.5] [--enhance]                two-pass loudness master (audio or video)
  check    VIDEO                                                         luma/saturation scope check (clipping, crushed blacks)
  edl      PLAN.json OUT.edl [--fps 30]                                  CMX3600 EDL (DaVinci / Premiere / CapCut import)
  otio     PLAN.json OUT.otio [--fps 30]                                 OpenTimelineIO JSON

Concepts follow majedphotos/video-ad-editor (MIT) workflows; the code here is HASKA's own.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cutplan  # noqa: E402
from platform_util import FFMPEG, FFPROBE  # noqa: E402


def probe_duration(path: str) -> float:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path], capture_output=True, text=True)
    return float(out.stdout.strip())


def load(path: str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path: str, data: dict) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- cuts
def cmd_silence(a):
    duration = probe_duration(a.video)
    silences = cutplan.detect_silences(a.video, a.noise, a.min)
    keep = cutplan.keep_from_silence(duration, silences, a.pad)
    plan = cutplan.new_plan(Path(a.video).name, duration, keep)
    plan["silences"] = [{"start": round(x, 3), "end": round(y, 3)} for x, y in silences]
    plan["base"] = plan["keep"]
    save(a.plan, plan)
    print(f"{len(silences)} silences; {duration:.2f}s -> {cutplan.edited_duration(plan):.2f}s; plan: {a.plan}")


def cmd_textcut(a):
    plan, words = load(a.plan), cutplan.flatten_words(load(a.transcript))
    base = [(k["start"], k["end"]) for k in plan.get("base", plan["keep"])]
    if a.undo:
        if not plan["ops"]:
            raise SystemExit("nothing to undo")
        cutplan.undo(plan, base, words)
    else:
        if a.drop_range:
            op = {"op": "drop", "from": a.drop_range[0], "to": a.drop_range[1]}
        else:
            phrase = a.drop or a.keep
            found = cutplan.find_phrase(words, phrase) if phrase else None
            if not found:
                raise SystemExit(f"phrase not found in transcript: {phrase!r}")
            op = {"op": "drop" if a.drop else "keep", "from": found[0], "to": found[1], "text": phrase}
        cutplan.apply_op(plan, words, op)
    save(a.plan, plan)
    print(f"{len(plan['ops'])} ops; edited duration {cutplan.edited_duration(plan):.2f}s")


def cmd_captions(a):
    plan, transcript = load(a.plan), load(a.transcript)
    segments = []
    for segment in transcript["segments"]:
        words = cutplan.remap_words(plan, segment["words"])
        if words:
            segments.append({**segment, "startMs": words[0]["startMs"], "endMs": words[-1]["endMs"], "text": " ".join(w["text"] for w in words), "words": words})
    save(a.out, {**transcript, "durationMs": int(cutplan.edited_duration(plan) * 1000), "segments": segments})
    print(f"{sum(len(s['words']) for s in segments)} words retimed -> {a.out}")


# ---------------------------------------------------------------- rhythm
def decode_mono(path: str, rate: int = 22050) -> np.ndarray:
    raw = subprocess.run([FFMPEG, "-nostdin", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype="<f4")


def beat_grid(y: np.ndarray, rate: int = 22050, lo: float = 70, hi: float = 180) -> dict:
    n_fft, hop = 1024, 512
    if len(y) < n_fft * 4:
        return {"bpm": 0.0, "beats": [], "downbeats": [], "onsets": 0}
    window = np.hanning(n_fft)
    frames = 1 + (len(y) - n_fft) // hop
    mags = np.abs(np.fft.rfft(np.stack([y[i * hop : i * hop + n_fft] * window for i in range(frames)]), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(10 * mags), axis=0)).sum(axis=1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fps = rate / hop
    ac = np.correlate(flux, flux, mode="full")[len(flux) - 1 :]
    lags = np.arange(int(fps * 60 / hi), int(fps * 60 / lo) + 1)
    lag = int(lags[np.argmax(ac[lags])])
    if 0 < lag < len(ac) - 1:  # parabolic interpolation: integer lags are too coarse (0.023 s per step)
        y0, y1, y2 = ac[lag - 1], ac[lag], ac[lag + 1]
        denom = y0 - 2 * y1 + y2
        period = lag + (0.5 * (y0 - y2) / denom if denom else 0.0)
    else:
        period = float(lag)
    bpm = 60 * fps / period
    count = int((len(flux) - 1) / period)
    best, offset = -1.0, 0.0
    for o in np.arange(0, period, 0.25):
        idx = np.round(o + period * np.arange(count)).astype(int)
        idx = idx[idx < len(flux)]
        score = flux[idx].sum()
        if score > best:
            best, offset = score, float(o)
    times = [round(float((offset + period * k + 1) / fps + n_fft / 2 / rate), 3) for k in range(count + 1) if offset + period * k < len(flux)]
    onsets = int(((flux[1:-1] > flux[:-2]) & (flux[1:-1] > flux[2:]) & (flux[1:-1] > 1.0)).sum())
    return {"bpm": round(float(bpm), 2), "beats": times, "downbeats": times[::4], "onsets": onsets}


def cmd_beats(a):
    result = beat_grid(decode_mono(a.audio))
    result.update({"source": Path(a.audio).name, "method": "spectral-flux autocorrelation (numpy)"})
    save(a.out, result)
    print(f"{result['bpm']} BPM, {len(result['beats'])} beats -> {a.out}")


# ---------------------------------------------------------------- reference styling
def dominant_colors(path: str, k: int = 5, seed: int = 7) -> list[tuple[int, int, int]]:
    from PIL import Image

    image = Image.open(path).convert("RGB")
    image.thumbnail((160, 160))
    pixels = np.asarray(image, dtype=np.float64).reshape(-1, 3)
    rng = np.random.default_rng(seed)  # fixed seed: same image -> same palette
    centers = pixels[rng.choice(len(pixels), size=min(k, len(pixels)), replace=False)]
    for _ in range(20):
        labels = np.argmin(((pixels[:, None, :] - centers[None]) ** 2).sum(axis=2), axis=1)
        centers = np.stack([pixels[labels == i].mean(axis=0) if (labels == i).any() else centers[i] for i in range(len(centers))])
    counts = np.bincount(labels, minlength=len(centers))
    order = np.argsort(-counts)
    return [tuple(int(round(c)) for c in centers[i]) for i in order]


def _hex(rgb) -> str:
    return "#%02x%02x%02x" % tuple(rgb)


def _luma(rgb) -> float:
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def _saturation(rgb) -> float:
    hi, lo = max(rgb), min(rgb)
    return 0 if hi == 0 else (hi - lo) / hi


def palette_profile(colors: list[tuple[int, int, int]], pid: str, name: str) -> dict:
    by_luma = sorted(colors, key=_luma)
    background = by_luma[0]
    if _luma(background) > 70:
        background = tuple(int(c * 0.18) for c in background)  # keep text legible: dark UI base from the reference hue
    surface = tuple(min(255, int(c * 1.0 + 18)) for c in background)
    chroma = sorted(colors, key=_saturation, reverse=True)
    primary = chroma[0]
    far = lambda c: sum(abs(x - y) for x, y in zip(c, primary)) > 90 and _luma(c) > 60
    accent = next((c for c in chroma[1:] if far(c)), None)
    if accent is None:  # reference has too few distinct bright colours: lighten the primary instead of reusing the background
        accent = tuple(min(255, int(c * 0.55 + 115)) for c in primary)
    text = (245, 247, 250)
    muted = tuple(int(0.62 * t + 0.38 * b) for t, b in zip(text, background))
    return {
        "schemaVersion": 1, "id": pid, "name": name, "extends": "haska-cyber",
        "description": "Palette derived from a reference image (dominant colours, fixed seed). Review contrast by eye.",
        "palette": {"background": _hex(background), "surface": _hex(surface), "primary": _hex(primary), "accent": _hex(accent), "text": _hex(text), "mutedText": _hex(muted)},
    }


def cmd_palette(a):
    pid = a.id or re.sub(r"[^a-z0-9]+", "-", Path(a.image).stem.lower()).strip("-") or "reference"
    profile = palette_profile(dominant_colors(a.image), f"ref-{pid}"[:40], a.name or f"Reference {pid}")
    save(a.out, profile)
    print(f"{profile['id']}: {profile['palette']} -> {a.out}")


# ---------------------------------------------------------------- finishing
def ffmpeg(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([FFMPEG, "-nostdin", "-hide_banner", *args], capture_output=True, text=True)


def cmd_matte(a):
    chain = f"chromakey={a.key}:{a.similarity}:{a.blend},format=yuva420p,alphaextract,format=gray"
    run = ffmpeg("-y", "-i", a.video, "-vf", chain, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", a.out)
    if run.returncode:
        raise SystemExit(run.stderr[-600:])
    print(f"matte (white = subject) -> {a.out}. Use it as the `person` layer; macOS Vision mattes can be supplied instead.")


ENHANCE = "highpass=f=80,afftdn=nf=-30,acompressor=threshold=-20dB:ratio=3:attack=15:release=180:makeup=2"


def measure_loudness(path: str, af: str | None = None) -> dict:
    chain = (af + "," if af else "") + "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json"
    run = ffmpeg("-i", path, "-vn", "-af", chain, "-f", "null", "-")
    body = run.stderr[run.stderr.rindex("{") : run.stderr.rindex("}") + 1]
    return json.loads(body)


def cmd_master(a):
    pre = ENHANCE if a.enhance else None
    m = measure_loudness(a.input, pre)
    norm = (pre + "," if pre else "") + (
        f"loudnorm=I={a.lufs}:TP={a.tp}:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true"
    )
    is_video = bool(subprocess.run([FFPROBE, "-v", "error", "-select_streams", "v", "-show_entries", "stream=index", "-of", "csv=p=0", a.input], capture_output=True, text=True).stdout.strip())
    codec = ["-c:v", "copy", "-c:a", "aac", "-b:a", "256k"] if is_video else ["-c:a", "pcm_s16le"]
    run = ffmpeg("-y", "-i", a.input, "-af", norm, "-ar", "48000", *codec, a.out)
    if run.returncode:
        raise SystemExit(run.stderr[-600:])
    after = measure_loudness(a.out)
    print(f"input {float(m['input_i']):.1f} LUFS / {float(m['input_tp']):.1f} dBTP -> output {float(after['input_i']):.1f} LUFS / {float(after['input_tp']):.1f} dBTP ({a.out})")


def cmd_check(a):
    run = ffmpeg("-i", a.video, "-vf", "fps=2,signalstats,metadata=print:file=-", "-an", "-f", "null", "-")
    values = {k: [float(v) for v in re.findall(rf"lavfi\.signalstats\.{k}=([0-9.]+)", run.stdout)] for k in ("YMIN", "YMAX", "SATAVG")}
    if not values["YMAX"]:
        raise SystemExit("no frames analysed")
    findings = []
    if max(values["YMAX"]) >= 254:
        findings.append("highlights clip to 255 in some frames")
    if min(values["YMIN"]) <= 1:
        findings.append("blacks crush to 0 in some frames")
    if max(values["SATAVG"]) > 110:
        findings.append("saturation very high (>110) in some frames")
    result = {"frames": len(values["YMAX"]), "YMIN": min(values["YMIN"]), "YMAX": max(values["YMAX"]), "SATAVG_max": max(values["SATAVG"]), "findings": findings}
    print(json.dumps(result, indent=2))


# ---------------------------------------------------------------- interchange
def timecode(frames: int, fps: int) -> str:
    return f"{frames // (fps * 3600):02d}:{frames // (fps * 60) % 60:02d}:{frames // fps % 60:02d}:{frames % fps:02d}"


def cmd_edl(a):
    plan = load(a.plan)
    reel = re.sub(r"[^A-Za-z0-9]", "", Path(plan["source"]).stem).upper()[:8] or "SOURCE"
    lines = [f"TITLE: {Path(plan['source']).stem}", "FCM: NON-DROP FRAME", ""]
    cursor = 0
    for i, k in enumerate(plan["keep"], 1):
        s, e = round(k["start"] * a.fps), round(k["end"] * a.fps)
        length = e - s
        lines.append(f"{i:03d}  {reel:<8} V     C        {timecode(s, a.fps)} {timecode(e, a.fps)} {timecode(cursor, a.fps)} {timecode(cursor + length, a.fps)}")
        lines.append(f"* FROM CLIP NAME: {plan['source']}")
        cursor += length
    Path(a.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(plan['keep'])} events -> {a.out}")


def cmd_otio(a):
    plan = load(a.plan)
    rt = lambda frames: {"OTIO_SCHEMA": "RationalTime.1", "rate": a.fps, "value": frames}
    clips = []
    for k in plan["keep"]:
        s, e = round(k["start"] * a.fps), round(k["end"] * a.fps)
        clips.append({"OTIO_SCHEMA": "Clip.2", "name": plan["source"], "source_range": {"OTIO_SCHEMA": "TimeRange.1", "start_time": rt(s), "duration": rt(e - s)},
                      "media_reference": {"OTIO_SCHEMA": "ExternalReference.1", "target_url": plan["source"], "available_range": None}})
    timeline = {"OTIO_SCHEMA": "Timeline.1", "name": Path(plan["source"]).stem, "tracks": {"OTIO_SCHEMA": "Stack.1", "children": [{"OTIO_SCHEMA": "Track.1", "kind": "Video", "children": clips}]}}
    save(a.out, timeline)
    print(f"{len(clips)} clips -> {a.out}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("silence"); p.add_argument("video"); p.add_argument("plan"); p.add_argument("--noise", type=float, default=-35); p.add_argument("--min", type=float, default=0.45); p.add_argument("--pad", type=float, default=0.08); p.set_defaults(fn=cmd_silence)
    p = sub.add_parser("textcut"); p.add_argument("plan"); p.add_argument("transcript"); g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--drop"); g.add_argument("--keep"); g.add_argument("--drop-range", nargs=2, type=int); g.add_argument("--undo", action="store_true"); p.set_defaults(fn=cmd_textcut)
    p = sub.add_parser("captions"); p.add_argument("plan"); p.add_argument("transcript"); p.add_argument("out"); p.set_defaults(fn=cmd_captions)
    p = sub.add_parser("beats"); p.add_argument("audio"); p.add_argument("out"); p.set_defaults(fn=cmd_beats)
    p = sub.add_parser("palette"); p.add_argument("image"); p.add_argument("out"); p.add_argument("--id"); p.add_argument("--name"); p.set_defaults(fn=cmd_palette)
    p = sub.add_parser("matte"); p.add_argument("video"); p.add_argument("out"); p.add_argument("--key", default="0x00ff00"); p.add_argument("--similarity", default="0.18"); p.add_argument("--blend", default="0.08"); p.set_defaults(fn=cmd_matte)
    p = sub.add_parser("master"); p.add_argument("input"); p.add_argument("out"); p.add_argument("--lufs", type=float, default=-14); p.add_argument("--tp", type=float, default=-1.5); p.add_argument("--enhance", action="store_true"); p.set_defaults(fn=cmd_master)
    p = sub.add_parser("check"); p.add_argument("video"); p.set_defaults(fn=cmd_check)
    for name, fn in (("edl", cmd_edl), ("otio", cmd_otio)):
        p = sub.add_parser(name); p.add_argument("plan"); p.add_argument("out"); p.add_argument("--fps", type=int, default=30); p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
