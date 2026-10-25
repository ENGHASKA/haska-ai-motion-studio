"""Cut-plan model: silence removal, text-based cuts (drop / keep / undo) and caption remapping.

Pure Python, no third-party packages. A plan is JSON: {"source", "duration", "keep": [{"start","end"}], "ops": [...]}.
All times are seconds on the SOURCE timeline; `remap` converts them to the edited timeline. Original-idea credit: the
silence + script-edit workflow of majedphotos/video-ad-editor (MIT); this implementation is HASKA's own.
"""
from __future__ import annotations

import re
import subprocess
from typing import Iterable

from platform_util import FFMPEG

Span = tuple[float, float]


def detect_silences(path: str, noise_db: float = -35.0, min_silence: float = 0.45) -> list[Span]:
    """Silent spans via ffmpeg silencedetect (parsed from stderr)."""
    run = subprocess.run([FFMPEG, "-nostdin", "-hide_banner", "-i", path, "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}", "-vn", "-f", "null", "-"], capture_output=True, text=True)
    starts = [float(m) for m in re.findall(r"silence_start: (-?[0-9.]+)", run.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: (-?[0-9.]+)", run.stderr)]
    spans = []
    for i, start in enumerate(starts):
        end = ends[i] if i < len(ends) else None
        spans.append((max(0.0, start), end if end is not None else start))
    return spans


def subtract(duration: float, removed: Iterable[Span]) -> list[Span]:
    """Keep-spans of [0, duration] after removing `removed` spans."""
    keep, cursor = [], 0.0
    for a, b in sorted((max(0.0, a), min(duration, b)) for a, b in removed if b > a):
        if a > cursor:
            keep.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < duration:
        keep.append((cursor, duration))
    return keep


def keep_from_silence(duration: float, silences: list[Span], pad: float = 0.08, min_keep: float = 0.15) -> list[Span]:
    """Cut silences but leave `pad` seconds of breathing room on each side so words are never clipped."""
    shrunk = [(a + pad, b - pad) for a, b in silences if b - a > 2 * pad]
    return [(a, b) for a, b in subtract(duration, shrunk) if b - a >= min_keep]


def new_plan(source: str, duration: float, keep: list[Span]) -> dict:
    return {"schemaVersion": 1, "source": source, "duration": duration, "keep": [{"start": round(a, 3), "end": round(b, 3)} for a, b in keep], "ops": []}


def spans(plan: dict) -> list[Span]:
    return [(k["start"], k["end"]) for k in plan["keep"]]


def edited_duration(plan: dict) -> float:
    return round(sum(b - a for a, b in spans(plan)), 3)


def remap(plan: dict, t: float) -> float | None:
    """Source time -> edited time (None when `t` falls inside a removed span)."""
    offset = 0.0
    for a, b in spans(plan):
        if a <= t <= b:
            return offset + (t - a)
        offset += b - a
    return None


def remap_words(plan: dict, words: list[dict]) -> list[dict]:
    """Caption words (startMs/endMs on the source timeline) -> edited timeline. Words fully inside a cut disappear."""
    out = []
    for word in words:
        a, b = word["startMs"] / 1000, word["endMs"] / 1000
        na, nb = remap(plan, a + 0.001), remap(plan, b - 0.001)
        na = na - 0.001 if na is not None else None
        nb = nb + 0.001 if nb is not None else None
        if na is None and nb is None:
            continue
        na = na if na is not None else (nb or 0.0)
        nb = nb if nb is not None else na
        out.append({**word, "startMs": int(round(na * 1000)), "endMs": max(int(round(nb * 1000)), int(round(na * 1000)) + 40)})
    return out


def flatten_words(transcript: dict) -> list[dict]:
    return [w for s in transcript["segments"] for w in s["words"]]


def apply_op(plan: dict, words: list[dict], op: dict) -> dict:
    """Ops: {"op":"drop","from":i,"to":j} removes words i..j; {"op":"keep","from":i,"to":j} keeps only those words.
    Word indexes refer to the flattened transcript. `undo` is handled by `undo()` (ops are replayed, never destructive)."""
    i, j = op["from"], op["to"]
    if not (0 <= i <= j < len(words)):
        raise ValueError(f"word range {i}..{j} is outside 0..{len(words) - 1}")
    a, b = words[i]["startMs"] / 1000, words[j]["endMs"] / 1000
    removed = [(a, b)] if op["op"] == "drop" else [(0.0, a), (b, plan["duration"])]
    plan["keep"] = _intersect(plan, removed)
    plan["ops"].append(op)
    return plan


def _intersect(plan: dict, removed: list[Span]) -> list[dict]:
    """Current keep-spans minus `removed`."""
    result = []
    for a, b in spans(plan):
        cursor = a
        for x, y in sorted(removed):
            if y <= cursor or x >= b:
                continue
            if x > cursor:
                result.append((cursor, x))
            cursor = max(cursor, y)
        if cursor < b:
            result.append((cursor, b))
    return [{"start": round(x, 3), "end": round(y, 3)} for x, y in result if y - x > 0.02]


def undo(plan: dict, base_keep: list[Span], words: list[dict]) -> dict:
    """Drop the last op by replaying the remaining ones on the base plan."""
    ops = plan["ops"][:-1]
    plan["keep"] = [{"start": round(a, 3), "end": round(b, 3)} for a, b in base_keep]
    plan["ops"] = []
    for op in ops:
        apply_op(plan, words, op)
    return plan


def find_phrase(words: list[dict], phrase: str) -> tuple[int, int] | None:
    """Locate a phrase (whitespace-separated words, punctuation ignored) in the flattened transcript."""
    norm = lambda s: re.sub(r"[\W_]+", "", s, flags=re.UNICODE)
    target = [norm(p) for p in phrase.split() if norm(p)]
    seq = [norm(w["text"]) for w in words]
    for i in range(len(seq) - len(target) + 1):
        if seq[i : i + len(target)] == target:
            return i, i + len(target) - 1
    return None
