#!/usr/bin/env python3
"""Energy-based caption alignment for an Audio-to-Motion project.

Whisper's own word timestamps are unreliable for dialect speech (words get multi-second spans or land inside pauses),
so this script re-times a corrected transcript from the recording itself:

  1. Phrase boundaries are snapped to the speaker's real pauses (>= 300 ms of silence), or, inside continuous speech,
     to the deepest loudness valley near the original boundary.
  2. Words are spread over the *speech* time of their phrase (pauses get no words) in proportion to word length, then
     each internal word boundary is snapped to the nearest loudness valley within a small window.

Text is never changed. Usage:  python3 scripts/align_words.py PROJECT_ID [--dry-run]
The result is approximate by nature: review it by ear against the preview.
"""
from __future__ import annotations

import argparse
import json
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HOP_MS = 10
PAUSE_MIN_MS = 300
PAUSE_DB = -38.0          # envelope below this counts as silence
VALLEY_DEPTH_DB = 5.0     # a valley must be this much below its surroundings
MIN_WORD_MS = 110


def load_envelope(path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(path), "rb") as handle:
        rate, width, channels = handle.getframerate(), handle.getsampwidth(), handle.getnchannels()
        if width != 2:
            raise SystemExit("narration.wav must be 16-bit PCM")
        data = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    hop = int(rate * HOP_MS / 1000)
    frames = len(data) // hop
    rms = np.sqrt((data[: frames * hop].reshape(frames, hop) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    kernel = np.ones(3) / 3  # 30 ms smoothing
    return np.convolve(db, kernel, mode="same"), rate


def pauses(db: np.ndarray) -> list[tuple[int, int]]:
    """Silent spans (ms) at least PAUSE_MIN_MS long."""
    quiet = db < PAUSE_DB
    spans, start = [], None
    for index, flag in enumerate(quiet):
        if flag and start is None:
            start = index
        if (not flag or index == len(quiet) - 1) and start is not None:
            end = index if not flag else index + 1
            if (end - start) * HOP_MS >= PAUSE_MIN_MS:
                spans.append((start * HOP_MS, end * HOP_MS))
            start = None
    return spans


def valleys(db: np.ndarray) -> list[tuple[int, float]]:
    """Local loudness minima (ms, depth in dB) that are clearly lower than the speech around them."""
    found = []
    radius = 12  # 120 ms each side
    for i in range(radius, len(db) - radius):
        window = db[i - radius : i + radius + 1]
        if db[i] == window.min() and db[i] < window.max() - VALLEY_DEPTH_DB and db[i] > PAUSE_DB - 25:
            found.append((i * HOP_MS, float(window.max() - db[i])))
    return found


def snap(target: float, candidates: list[tuple[int, float]], window: int) -> tuple[float, bool]:
    near = [(abs(ms - target) - depth * 4, ms) for ms, depth in candidates if abs(ms - target) <= window]
    return (float(min(near)[1]), True) if near else (target, False)


def speech_spans(start: int, end: int, silent: list[tuple[int, int]]) -> list[tuple[int, int]]:
    spans, cursor = [], start
    for a, b in silent:
        if b <= start or a >= end:
            continue
        if a > cursor:
            spans.append((cursor, min(a, end)))
        cursor = max(cursor, b)
    if cursor < end:
        spans.append((cursor, end))
    return spans or [(start, end)]


def at_speech_time(spans: list[tuple[int, int]], offset: float) -> float:
    for a, b in spans:
        if offset <= b - a:
            return a + offset
        offset -= b - a
    return float(spans[-1][1])


def refine(transcript: dict, db: np.ndarray, duration_ms: int) -> dict:
    silent = pauses(db)
    dips = valleys(db)
    report = {"phraseSnappedToPause": 0, "phraseSnappedToValley": 0, "phraseKept": 0, "wordsSnapped": 0, "wordBoundaries": 0}
    segments = transcript["segments"]

    for left, right in zip(segments, segments[1:]):
        boundary = left["endMs"] if left["endMs"] >= right["startMs"] - 1 else (left["endMs"] + right["startMs"]) // 2
        near = [p for p in silent if p[0] < boundary + 1200 and p[1] > boundary - 1200]
        if near:
            a, b = max(near, key=lambda p: p[1] - p[0])
            left["endMs"], right["startMs"] = a, b
            report["phraseSnappedToPause"] += 1
            continue
        moved, ok = snap(boundary, dips, 700)
        if ok and left["startMs"] + 400 < moved < right["endMs"] - 400:
            left["endMs"] = right["startMs"] = int(moved)
            report["phraseSnappedToValley"] += 1
        else:
            report["phraseKept"] += 1
    segments[-1]["endMs"] = min(segments[-1]["endMs"], duration_ms)
    tail = [a for a, b in silent if b >= duration_ms - 600]
    if tail and tail[0] > segments[-1]["startMs"] + 800:
        segments[-1]["endMs"] = tail[0]

    for segment in segments:
        words = [w["text"] for w in segment["words"]]
        spans = speech_spans(segment["startMs"], segment["endMs"], silent)
        total = sum(b - a for a, b in spans)
        weights = [len(w) + 1 for w in words]
        cumulative = np.cumsum([0, *weights]) / sum(weights)
        edges = [at_speech_time(spans, total * c) for c in cumulative]
        for i in range(1, len(words)):
            window = int(min(260, 0.45 * min(edges[i] - edges[i - 1], edges[i + 1] - edges[i])))
            moved, ok = snap(edges[i], dips, max(0, window))
            report["wordBoundaries"] += 1
            if ok and moved - edges[i - 1] >= MIN_WORD_MS and edges[i + 1] - moved >= MIN_WORD_MS:
                edges[i] = moved
                report["wordsSnapped"] += 1
        for word, a, b in zip(segment["words"], edges, edges[1:]):
            word["startMs"], word["endMs"], word["timestampMs"] = int(a), max(int(b), int(a) + 40), int(a)
        segment["words"][-1]["endMs"] = min(segment["words"][-1]["endMs"], segment["endMs"])
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    directory = ROOT / "public" / "audio-projects" / args.project
    transcript_path = directory / "transcript.json"
    transcript = json.loads(transcript_path.read_text())
    db, _ = load_envelope(directory / "narration.wav")
    duration = int(json.loads((directory / "source.json").read_text())["durationMs"])
    report = refine(transcript, db, duration)
    for key, value in report.items():
        print(f"{key}: {value}")
    if args.dry_run:
        return 0
    transcript_path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2) + "\n")
    print(f"Updated {transcript_path} (text unchanged; run validate + activate)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
