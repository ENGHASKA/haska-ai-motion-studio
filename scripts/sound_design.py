#!/usr/bin/env python3
"""Original, locally synthesized soundtrack for an Audio-to-Motion project (music + sound effects + mix report).

Nothing is downloaded and no third-party audio is used: every sample is generated here with numpy/scipy from a fixed seed,
so the result is reproducible and license-free. Event times come from the storyboard (scene starts + cues) and the voice
loudness envelope drives the music ducking, so the sound follows the picture and your voice stays on top.

    python3 scripts/sound_design.py my-project            # writes sound/music.wav, sound/sfx.wav, sound/mix-report.json
    python3 scripts/sound_design.py my-project --check    # re-measure an existing mix without regenerating

The voice file is never modified. The report recommends a narration volume that keeps the summed mix below clipping.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))
from platform_util import FFMPEG  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SR = 48000
BPM = 108.0
BEAT = 60.0 / BPM
STEP = BEAT / 4.0

# ----------------------------------------------------------------------------------------------------------------------
# DSP helpers
# ----------------------------------------------------------------------------------------------------------------------


def midi(note: float) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def env_ad(n: int, attack: float, release: float, curve: float = 3.0) -> np.ndarray:
    a, r = max(1, int(attack * SR)), max(1, int(release * SR))
    out = np.ones(n)
    a = min(a, n)
    out[:a] = np.linspace(0, 1, a) ** 1.5
    r = min(r, n)
    out[n - r :] *= (np.linspace(1, 0, r)) ** curve
    return out


def decay_env(n: int, tau: float) -> np.ndarray:
    return np.exp(-np.arange(n) / (tau * SR))


def saw(freq: float, n: int, phase: float = 0.0) -> np.ndarray:
    return ((np.arange(n) * freq / SR + phase) % 1.0) * 2 - 1


def square(freq: float, n: int, width: float = 0.5) -> np.ndarray:
    return np.where(((np.arange(n) * freq / SR) % 1.0) < width, 1.0, -1.0)


def sine(freq, n: int) -> np.ndarray:
    freq = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return np.sin(2 * np.pi * np.cumsum(freq) / SR)


def lowpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low", output="sos"), x)


def highpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, fc / (SR / 2), "high", output="sos"), x)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], "band", output="sos"), x)


def sweep_filter(x: np.ndarray, f0: float, f1: float, kind: str = "low", width: float = 0.25, chunk: int = 480) -> np.ndarray:
    """Time-varying filter: cutoff moves exponentially f0 -> f1 across the signal (state carried between chunks)."""
    out = np.zeros_like(x)
    zi = None
    n = len(x)
    for start in range(0, n, chunk):
        fc = f0 * (f1 / f0) ** (start / max(1, n))
        fc = float(np.clip(fc, 30, SR * 0.45))
        if kind == "low":
            sos = signal.butter(2, fc / (SR / 2), "low", output="sos")
        else:
            sos = signal.butter(2, [fc * (1 - width) / (SR / 2), min(fc * (1 + width), SR * 0.45) / (SR / 2)], "band", output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[start : start + chunk], zi = signal.sosfilt(sos, x[start : start + chunk], zi=zi)
    return out


def reverb_ir(rt60: float, seed: int, bright: float = 7000.0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.3 * SR)
    t = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)]) * np.exp(-6.9 * t / rt60)
    ir = np.stack([lowpass(ch, bright, 1) for ch in ir])
    ir[:, : int(0.018 * SR)] *= np.linspace(0, 1, int(0.018 * SR))  # soft pre-delay onset
    return ir / np.sqrt((ir**2).sum(axis=1, keepdims=True).mean())


def convolve(stereo: np.ndarray, ir: np.ndarray) -> np.ndarray:
    return np.stack([signal.fftconvolve(stereo[c], ir[c])[: stereo.shape[1]] for c in range(2)])


class Bus:
    """A stereo buffer that sounds can be mixed into at a time, with pan and gain."""

    def __init__(self, seconds: float):
        self.n = int(seconds * SR)
        self.buf = np.zeros((2, self.n))

    def add(self, sound: np.ndarray, t: float, gain: float = 1.0, pan: float = 0.0) -> None:
        start = int(round(t * SR))
        if start >= self.n or start + sound.shape[-1] <= 0:
            return
        mono = sound if sound.ndim == 1 else None
        lo, hi = max(0, -start), min(sound.shape[-1], self.n - start)
        angle = (pan + 1) * np.pi / 4
        left, right = np.cos(angle), np.sin(angle)
        if mono is not None:
            seg = mono[lo:hi] * gain
            self.buf[0, start + lo : start + hi] += seg * left
            self.buf[1, start + lo : start + hi] += seg * right
        else:
            self.buf[:, start + lo : start + hi] += sound[:, lo:hi] * gain


# ----------------------------------------------------------------------------------------------------------------------
# Instruments
# ----------------------------------------------------------------------------------------------------------------------


def supersaw(freq: float, n: int, spread: float = 0.12, voices: int = 5) -> np.ndarray:
    """Stereo detuned saw stack, returned as (2, n)."""
    out = np.zeros((2, n))
    for i in range(voices):
        detune = (i - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        wave_ = saw(freq * 2 ** (detune / 12), n, phase=i * 0.17)
        pan = (i - (voices - 1) / 2) / ((voices - 1) / 2) * 0.8
        angle = (pan + 1) * np.pi / 4
        out[0] += wave_ * np.cos(angle)
        out[1] += wave_ * np.sin(angle)
    return out / voices


def pad(notes: list[float], dur: float, brightness: float = 1400.0) -> np.ndarray:
    n = int(dur * SR)
    out = np.zeros((2, n))
    for note in notes:
        out += supersaw(midi(note), n)
    out = np.stack([sweep_filter(ch, brightness * 0.5, brightness) for ch in out]) / max(1, len(notes))
    return out * env_ad(n, min(1.6, dur * 0.45), min(1.8, dur * 0.5), 2.0)


def pluck(freq: float, dur: float, bright: float = 3200.0, square_mix: float = 0.0) -> np.ndarray:
    n = int(dur * SR)
    raw = (1 - square_mix) * saw(freq, n) + square_mix * square(freq, n, 0.35)
    tone = sweep_filter(raw, bright, bright * 0.18) * decay_env(n, dur * 0.28)
    tone[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return tone


def bass(freq: float, dur: float, drive: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    tone = 0.75 * sine(freq, n) + 0.35 * lowpass(saw(freq, n), 220, 2) * drive
    return tone * env_ad(n, 0.008, min(0.12, dur * 0.5), 1.5)


def kick(strength: float = 1.0) -> np.ndarray:
    n = int(0.42 * SR)
    freq = 46 + 110 * np.exp(-np.arange(n) / (0.035 * SR))
    body = sine(freq, n) * decay_env(n, 0.13)
    click = lowpass(np.random.default_rng(3).standard_normal(n), 4000) * decay_env(n, 0.004) * 0.35
    return (body + click) * strength


def hat(open_: bool = False, seed: int = 0) -> np.ndarray:
    n = int((0.22 if open_ else 0.05) * SR)
    noise = highpass(np.random.default_rng(seed).standard_normal(n), 7500)
    return noise * decay_env(n, 0.07 if open_ else 0.012) * 0.45


def clap(seed: int = 5) -> np.ndarray:
    n = int(0.22 * SR)
    rng = np.random.default_rng(seed)
    noise = bandpass(rng.standard_normal(n), 900, 3800)
    env = decay_env(n, 0.07)
    for k in (0.012, 0.024):
        env[int(k * SR) :] += 0.6 * decay_env(n - int(k * SR), 0.05)
    return noise * env * 0.5


def noise_sweep(dur: float, f0: float, f1: float, kind: str = "band", seed: int = 0, shape: str = "swell") -> np.ndarray:
    n = int(dur * SR)
    noise = np.random.default_rng(seed).standard_normal(n)
    out = sweep_filter(noise, f0, f1, kind, width=0.35)
    t = np.linspace(0, 1, n)
    env = {"swell": np.sin(np.pi * t) ** 1.6, "rise": t**2.2, "fall": (1 - t) ** 2.0, "burst": np.exp(-6 * t)}[shape]
    return out * env


def impact(power: float = 1.0, tail: float = 1.4, seed: int = 11) -> np.ndarray:
    n = int(tail * SR)
    freq = 34 + 90 * np.exp(-np.arange(n) / (0.12 * SR))
    sub = sine(freq, n) * decay_env(n, 0.55)
    rng = np.random.default_rng(seed)
    crack = lowpass(rng.standard_normal(n), 6000) * decay_env(n, 0.045) * 0.8
    boom = lowpass(rng.standard_normal(n), 380) * decay_env(n, 0.3) * 0.7
    return (sub * 1.1 + crack + boom) * power


def click(freq: float = 1900.0, seed: int = 0, soft: bool = False) -> np.ndarray:
    n = int(0.09 * SR)
    tick = lowpass(np.random.default_rng(seed).standard_normal(n), 5200) * decay_env(n, 0.0018) * (0.25 if soft else 0.5)
    tone = sine(freq, n) * decay_env(n, 0.016) * (0.5 if soft else 0.8)
    return tick + tone


def ping(freq: float, dur: float = 0.9, bright: float = 1.0) -> np.ndarray:
    n = int(dur * SR)
    tone = sine(freq, n) + 0.35 * bright * sine(freq * 2.01, n) + 0.15 * bright * sine(freq * 3.97, n)
    return tone * decay_env(n, dur * 0.3) * env_ad(n, 0.003, 0.05, 1)


def blip(freq: float, dur: float = 0.14, up: float = 1.5) -> np.ndarray:
    n = int(dur * SR)
    f = freq * (1 + (up - 1) * np.linspace(0, 1, n) ** 0.6)
    return sine(f, n) * env_ad(n, 0.004, dur * 0.6, 1.2) * 0.7


def glitch(seed: int, dur: float = 0.38) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    base = bandpass(rng.standard_normal(n), 400, 5200) * 0.5 + sine(rng.choice([180, 240, 320, 480]), n) * 0.4
    out = np.zeros(n)
    pos = 0
    while pos < n:
        length = int(rng.uniform(0.012, 0.045) * SR)
        chunk = base[rng.integers(0, max(1, n - length)) :][:length]
        if rng.random() < 0.55:  # bit/sample-rate reduction on some slices
            step = int(rng.integers(6, 28))
            chunk = np.repeat(chunk[::step], step)[: len(chunk)]
        gain = rng.choice([0.0, 0.7, 1.0, 0.5], p=[0.2, 0.3, 0.35, 0.15])
        out[pos : pos + len(chunk)] = chunk[: n - pos] * gain
        pos += length
    return np.tanh(out * 1.6) * env_ad(n, 0.002, dur * 0.4, 1.5) * 0.65


def error_buzz() -> np.ndarray:
    n = int(0.16 * SR)
    return lowpass(square(112, n) + 0.5 * square(168, n), 900) * env_ad(n, 0.004, 0.09, 1.5) * 0.4


def servo(dur: float, f0: float, f1: float) -> np.ndarray:
    n = int(dur * SR)
    f = np.linspace(f0, f1, n) * (1 + 0.04 * np.sin(2 * np.pi * 17 * np.arange(n) / SR))
    tone = lowpass(((np.cumsum(f) / SR) % 1) * 2 - 1, 1500) * 0.5 + 0.25 * sine(f * 2, n)
    return tone * env_ad(n, 0.04, 0.12, 1.2) * 0.6


def tick_tock(low: bool) -> np.ndarray:
    n = int(0.06 * SR)
    f = 640 if low else 980
    return (sine(f, n) * decay_env(n, 0.012) + 0.4 * lowpass(np.random.default_rng(int(f)).standard_normal(n), 3000) * decay_env(n, 0.004)) * 0.6


def boing(dur: float = 0.5) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 300 + 260 * np.sin(2 * np.pi * 5.5 * t) * np.exp(-t * 4.5) + 120 * np.exp(-t * 3)
    return sine(f, n) * decay_env(n, dur * 0.45) * env_ad(n, 0.004, 0.06, 1.2) * 0.55


def sad_trombone() -> np.ndarray:
    """Four falling 'wah' notes, with the last one sliding and wobbling: the classic comic fail."""
    notes = [(0.0, 0.42, 58), (0.46, 0.4, 57), (0.9, 0.42, 56), (1.36, 1.0, 55)]
    out = np.zeros(int(2.5 * SR))
    for k, (start, dur, note) in enumerate(notes):
        n = int(dur * SR)
        t = np.arange(n) / SR
        vib = 1 + (0.02 * np.sin(2 * np.pi * 5.2 * t) * (t > 0.3) if k == 3 else 0)
        slide = 1 - (0.09 * (t / dur) ** 2 if k == 3 else 0)
        f = midi(note) * vib * slide
        tone = lowpass(((np.cumsum(f) / SR) % 1) * 2 - 1, 1100) + 0.4 * lowpass(square(midi(note), n), 700)
        wah = sweep_filter(tone, 380, 1700, "low") * (0.6 + 0.4 * np.sin(np.pi * np.clip(t / dur, 0, 1)))
        out[int(start * SR) : int(start * SR) + n] += wah * env_ad(n, 0.05, 0.12, 1.2) * 0.5
    return out


def marimba(note: float, dur: float = 0.5) -> np.ndarray:
    n = int(dur * SR)
    f = midi(note)
    tone = sine(f, n) + 0.5 * sine(f * 4.0, n) * decay_env(n, 0.05) + 0.2 * sine(f * 9.2, n) * decay_env(n, 0.02)
    return tone * decay_env(n, 0.18) * env_ad(n, 0.002, 0.04, 1) * 0.6


def sparkle(seed: int = 3) -> np.ndarray:
    out = np.zeros(int(1.4 * SR))
    for k, note in enumerate([88, 91, 95, 100]):
        s = ping(midi(note), 0.7, 0.4)
        out[int(k * 0.07 * SR) : int(k * 0.07 * SR) + len(s)] += s * 0.45
    return out


def data_chirp(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    out = np.zeros(int(0.45 * SR))
    for k in range(8):
        f = midi(rng.choice([84, 88, 91, 93, 96, 100]))
        n = int(0.036 * SR)
        s = sine(f, n) * env_ad(n, 0.002, 0.03, 1.2)
        out[int(k * 0.05 * SR) : int(k * 0.05 * SR) + n] += s * 0.4
    return out


# ----------------------------------------------------------------------------------------------------------------------
# Project data
# ----------------------------------------------------------------------------------------------------------------------


def load_project(project: str):
    directory = ROOT / "public" / "audio-projects" / project
    storyboard = json.loads((directory / "storyboard.json").read_text())
    source = json.loads((directory / "source.json").read_text())
    with wave.open(str(directory / "narration.wav"), "rb") as handle:
        rate, channels = handle.getframerate(), handle.getnchannels()
        voice = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).astype(np.float64) / 32768.0
    if channels > 1:
        voice = voice.reshape(-1, channels).mean(axis=1)
    if rate != SR:
        voice = signal.resample_poly(voice, SR, rate)
    return directory, storyboard, source, voice


def voice_activity(voice: np.ndarray, n: int) -> np.ndarray:
    """0..1 'someone is speaking' curve at sample rate: RMS (25 ms) above a threshold, smoothed with fast attack, slow release."""
    hop = int(0.01 * SR)
    frames = len(voice) // hop
    rms = np.sqrt((voice[: frames * hop].reshape(frames, hop) ** 2).mean(axis=1) + 1e-12)
    db = 20 * np.log10(rms)
    active = np.clip((db + 46) / 8.0, 0, 1)  # -46 dB -> 0, -38 dB -> 1
    smooth = np.zeros(frames)
    a_up, a_down = 1 - np.exp(-1 / 6), 1 - np.exp(-1 / 55)  # ~60 ms attack, ~550 ms release (10 ms frames)
    level = 0.0
    for i, value in enumerate(active):
        level += (value - level) * (a_up if value > level else a_down)
        smooth[i] = level
    curve = np.interp(np.arange(n) / SR, np.arange(frames) * 0.01, smooth)
    return curve


# ----------------------------------------------------------------------------------------------------------------------
# Music
# ----------------------------------------------------------------------------------------------------------------------

MINOR = [([57, 60, 64], 33), ([53, 57, 60], 29), ([60, 64, 67], 36), ([55, 59, 62], 31)]  # Am F C G (pad notes, bass root)
TENSION = [([59, 62, 65], 35), ([56, 59, 62, 64], 28)]  # Bdim, E7
WARM = [([60, 64, 67, 71], 36), ([59, 62, 67], 31), ([57, 60, 64], 33), ([53, 57, 60, 64], 29)]  # C, G/B, Am, F(add)


def compose_music(seconds: float, marks: dict) -> tuple[np.ndarray, np.ndarray]:
    """Returns (dry stereo, reverb-send stereo)."""
    dry, wet = Bus(seconds), Bus(seconds)
    s = marks["starts"]  # scene start times (s)
    end = seconds

    def section(t: float) -> str:
        if t < s[1]:
            return "intro"
        if t < s[2]:
            return "build"
        if t < s[4]:
            return "drive"
        if t < s[5]:
            return "drive"
        if t < s[7]:
            return "tension"
        if t < s[8]:
            return "warm"
        if t < s[9]:
            return "glitch"
        if t < marks["silence_start"]:
            return "suspense"
        if t < marks["stamp"]:
            return "silent"
        return "outro"

    # --- harmony: pad + bass per bar/half-bar
    bar = BEAT * 4
    t = 0.0
    while t < end:
        name = section(t)
        if name in ("silent",):
            t += bar
            continue
        progression = {"intro": MINOR, "build": MINOR, "drive": MINOR, "tension": TENSION, "warm": WARM, "glitch": MINOR[:1], "suspense": MINOR[:1], "outro": WARM[:1]}[name]
        beat_len = bar if name not in ("tension",) else BEAT * 2
        index = int((t - {"intro": 0, "build": s[1], "drive": s[2], "tension": s[5], "warm": s[7], "glitch": s[8], "suspense": s[9], "outro": marks["stamp"]}[name]) / beat_len)
        notes, root = progression[index % len(progression)]
        stop = min(t + beat_len, end)
        # sections end where the next begins: chord tails are cut by the section classifier on the next step
        level = {"intro": 0.5, "build": 0.7, "drive": 0.8, "tension": 0.75, "warm": 0.7, "glitch": 0.55, "suspense": 0.6, "outro": 0.6}[name]
        if name == "intro":
            level *= min(1.0, t / 4.0 + 0.3)
        chord = pad(notes if name != "tension" else notes, (stop - t) + 0.8, 900 if name in ("tension", "suspense") else 1500)
        dry.add(chord, t, level * 0.34)
        wet.add(chord, t, level * 0.26)
        if name in ("build", "drive", "glitch", "tension", "intro", "suspense") and t >= (6.0 if name == "intro" else 0):
            gate = 0.5 if name in ("build", "drive") else 1.0
            root_f = midi(root)
            for k in range(int((stop - t) / (BEAT / 2))):
                note_t = t + k * BEAT / 2
                if name == "glitch" and k % 3 == 2:
                    continue  # stuttering bass
                if name == "suspense":
                    dry.add(bass(root_f, BEAT * 1.9), note_t, 0.34) if k % 4 == 0 else None
                    continue
                dry.add(bass(root_f * (2 if (k % 4 == 3 and name == "drive") else 1), BEAT * 0.45 * gate + 0.05), note_t, 0.36 if name != "intro" else 0.26)
        t = stop

    # --- arpeggio (16th notes): harmonic tones, filter opens with intensity; atonal-ish in tension
    arp_from = {"intro": 3.0, "build": s[1], "drive": s[2], "tension": s[5], "warm": s[7], "glitch": s[8]}
    step_index = 0
    while step_index * STEP < end:
        t = step_index * STEP
        step_index += 1
        name = section(t)
        if name in ("silent", "suspense", "outro") or t < arp_from.get(name, 0):
            continue
        progression = {"intro": MINOR, "build": MINOR, "drive": MINOR, "tension": TENSION, "warm": WARM, "glitch": MINOR[:1]}[name]
        beat_len = bar if name != "tension" else BEAT * 2
        base = {"intro": 0, "build": s[1], "drive": s[2], "tension": s[5], "warm": s[7], "glitch": s[8]}[name]
        notes, _ = progression[int((t - base) / beat_len) % len(progression)]
        pattern = [0, 1, 2, 3, 2, 1, 0, 2] if name != "warm" else [0, 2, 1, 3, 0, 2, 1, 3]
        if name == "warm" and step_index % 2:
            continue  # sparse 8ths in the relief
        tones = notes + [notes[0] + 12, notes[1] + 12]
        note = tones[pattern[step_index % len(pattern)] % len(tones)] + (12 if name in ("drive",) and (t // BEAT) % 2 else 0)
        bright = {"intro": 1400, "build": 2200, "drive": 3600, "tension": 1800, "warm": 1700, "glitch": 3000}[name]
        level = {"intro": 0.2, "build": 0.26, "drive": 0.3, "tension": 0.24, "warm": 0.17, "glitch": 0.28}[name]
        pan = 0.5 * np.sin(step_index * 0.9)
        sound = pluck(midi(note), STEP * 2.6, bright, square_mix=0.2)
        if name == "glitch" and step_index % 5 == 0:
            step = 18
            sound = np.repeat(sound[::step], step)[: len(sound)]  # bit-reduced stab
        dry.add(sound, t, level, pan)
        wet.add(sound, t, level * 0.8, -pan)

    # --- drums
    groove = {"build": (s[1] + 4.0, s[2]), "drive": (s[2], s[5])}
    for name, (a, b) in groove.items():
        beat_index = 0
        t = a
        while t < b:
            if name == "drive" or beat_index % 2 == 0:
                dry.add(kick(0.9 if name == "drive" else 0.6), t, 0.6)
            if beat_index % 2 == 1 and name == "drive":
                dry.add(clap(beat_index), t, 0.35)
            for sub in range(4):
                if name == "build" and sub % 2:
                    continue
                accent = 0.5 if sub % 2 == 0 else 0.3
                dry.add(hat(sub == 3 and beat_index % 4 == 3, seed=beat_index * 4 + sub), t + sub * STEP, accent * (0.5 if name == "build" else 0.7), 0.3 * ((-1) ** sub))
            t += BEAT
            beat_index += 1
    # tension: heartbeat instead of a groove, then rising 16th hats toward the relief
    t = s[5]
    while t < s[7]:
        dry.add(kick(0.55), t, 0.5)
        dry.add(kick(0.4), t + BEAT * 0.42, 0.4)
        t += BEAT * 2
    t = s[6]
    k = 0
    while t < s[7]:
        progress = (t - s[6]) / (s[7] - s[6])
        dry.add(hat(False, seed=900 + k), t, 0.1 + 0.35 * progress, 0.4 * ((-1) ** k))
        t += STEP
        k += 1
    # glitch scene: stuttering kicks
    t = s[8]
    k = 0
    while t < s[9]:
        if k % 8 in (0, 3, 6):
            dry.add(kick(0.7), t, 0.5)
        if k % 8 == 4:
            dry.add(clap(k), t, 0.28)
        dry.add(hat(False, seed=1500 + k), t, 0.2, 0.3 * ((-1) ** k))
        t += STEP * 2
        k += 1

    # --- suspense drone (A1 + fifth) with a slowly closing filter, then the cut
    drone_len = marks["silence_start"] - s[9]
    n = int(drone_len * SR)
    drone = sine(midi(33), n) * 0.5 + lowpass(saw(midi(45), n), 400) * 0.4 + lowpass(saw(midi(52) * 1.003, n), 700) * 0.2
    drone *= env_ad(n, 2.0, 0.25, 1.0) * np.linspace(0.6, 1.0, n)
    dry.add(drone, s[9], 0.34)
    wet.add(drone, s[9], 0.2)

    # --- outro: bouncy marimba figure in C, chosen to feel cheeky rather than triumphant
    out_t = marks["stamp"] + 0.95
    figure = [(0, 72), (0.5, 76), (1.0, 79), (1.5, 76), (2.0, 72), (2.5, 79), (3.0, 84)]
    for beat_offset, note in figure:
        tt = out_t + beat_offset * BEAT * 0.5
        if tt < end:
            dry.add(marimba(note), tt, 0.42, pan=0.3 * np.sin(note))
            wet.add(marimba(note), tt, 0.3)
    return dry.buf, wet.buf


# ----------------------------------------------------------------------------------------------------------------------
# Sound effects, driven by the storyboard cues
# ----------------------------------------------------------------------------------------------------------------------


def sfx_events(storyboard: dict) -> tuple[list[dict], dict]:
    scenes = storyboard["scenes"]
    starts = [sc["startMs"] / 1000 for sc in scenes]
    cue = lambda i, name, default=0.0: starts[i] + float(scenes[i].get("options", {}).get("cues", {}).get(name, default))
    ev: list[dict] = []

    def add(kind: str, t: float, gain: float = 1.0, pan: float = 0.0, **kw):
        ev.append({"kind": kind, "t": max(0.0, t), "gain": gain, "pan": pan, **kw})

    # hook
    add("impact", 0.02, 0.9)
    add("whoosh", 0.0, 0.5, pan=0.0, dur=0.9, f0=300, f1=5200, shape="burst")
    add("click", cue(0, "name") + 0.05, 0.6)
    add("whoosh", cue(0, "name") - 0.1, 0.35, pan=-0.3, dur=0.5, f0=700, f1=3500)
    add("click", cue(0, "role"), 0.55, pan=0.2)
    add("click", cue(0, "place"), 0.4, pan=-0.2, soft=True)
    add("chirp", cue(0, "badge"), 0.5, pan=0.1, seed=1)
    add("ping", cue(0, "badge") + 0.9, 0.5, freq=midi(88))

    # transitions between scenes
    kinds = {"camera-pull": ("whoosh", 0.75, 400, 4200), "push": ("whoosh", 0.7, 250, 2600), "zoom-through": ("whoosh", 0.95, 200, 6000), "wipe": ("whoosh", 0.65, 900, 4600), "crossfade": ("whoosh", 0.5, 1500, 3000)}
    for i in range(1, len(scenes)):
        tr = scenes[i].get("transitionIn")
        if not tr:
            continue
        _, gain, f0, f1 = kinds[tr["type"]]
        dur = max(0.45, tr["durationMs"] / 1000 + 0.25)
        add("whoosh", starts[i] - 0.12, 0.55 * gain, pan=(-0.4 if i % 2 else 0.4), dur=dur, f0=f0, f1=f1)
        if tr["type"] == "zoom-through":
            add("impact", starts[i] + 0.12, 0.55)

    # neural
    add("chirp", cue(1, "claude") - 0.1, 0.45, seed=2)
    add("ping", cue(1, "claude"), 0.6, freq=midi(79))
    add("click", cue(1, "claude") + 0.6, 0.4, pan=0.4)
    add("riser", cue(1, "curve") - 0.2, 0.55, dur=2.4)
    add("whoosh", cue(1, "curve") + 2.0, 0.5, pan=0.3, dur=0.7, f0=500, f1=7000, shape="burst")

    # team
    for k, offset in enumerate([0, 0.6, 1.2, 1.8]):
        add("click", cue(2, "team") + offset, 0.28, pan=(-0.5, 0.2, -0.1, 0.5)[k], soft=True)
    add("click", cue(2, "designers"), 0.4, pan=-0.3)
    add("click", cue(2, "devs"), 0.4, pan=0.3)
    add("suck", cue(2, "collapse") - 0.05, 0.7, dur=0.95)
    add("impact", cue(2, "collapse") + 0.6, 0.85)
    add("ping", cue(2, "collapse") + 0.65, 0.5, freq=midi(76))
    add("whoosh", cue(2, "race"), 0.45, dur=0.5, f0=700, f1=6000)
    add("ping", cue(2, "race") + 0.55, 0.4, freq=midi(91), bright=0.5)

    # cybersecurity
    add("chirp", cue(3, "head") - 0.1, 0.5, seed=3)
    add("sweep_tone", cue(3, "head"), 0.4, dur=1.4)
    for k, at in enumerate(scenes[3]["options"]["chipAt"]):
        add("click", starts[3] + at, 0.5, pan=(-0.4 if k % 2 == 0 else 0.4))
    # specialties
    for k, item in enumerate(scenes[4]["options"]["items"]):
        at = starts[4] + item["at"]
        if k < 3:
            add("blip", at, 0.55, freq=523.25 * 2 ** ([0, 2, 4][k] / 12), pan=0.0)
        else:
            add("impact", at, 0.55)
            add("ping", at + 0.02, 0.6, freq=midi(84))
            add("whoosh", at - 0.05, 0.4, dur=0.5, f0=600, f1=5000)
    # question
    add("blip", cue(5, "question"), 0.55, freq=330, up=2.0)
    add("impact", cue(5, "question") + 0.02, 0.35)
    add("click", cue(5, "ai"), 0.5, pan=-0.3)
    add("click", cue(5, "experience"), 0.5, pan=0.3)
    add("riser", cue(5, "experience") + 0.4, 0.3, dur=2.0)
    # jobs flipping: rising pitch so it reads as tension, not as clutter
    for k, item in enumerate(scenes[6]["options"]["items"]):
        add("flip", starts[6] + item["at"], 0.42, pan=-0.4 + 0.16 * k, freq=420 * 2 ** (k / 6))
    # human: relief
    add("swell", cue(7, "human"), 0.55, dur=2.4)
    add("ping", cue(7, "ok"), 0.55, freq=midi(84))
    add("ping", cue(7, "ok") + 0.12, 0.35, freq=midi(88))
    # glitch
    for k, at in enumerate(scenes[8]["options"]["errors"]):
        add("glitch", starts[8] + at, 0.55, pan=(-0.3, 0.3, -0.2, 0.2)[k], seed=40 + k)
        add("buzz", starts[8] + at + 0.03, 0.42)

    # finale
    clock_start = cue(9, "clock")
    for k in range(int((cue(9, "race") - clock_start - 0.2) / 0.5)):
        add("tick" if k % 2 == 0 else "tock", clock_start + 0.1 + k * 0.5, 0.3 if k else 0.36)
    add("whoosh", cue(9, "race") - 0.05, 0.45, dur=0.6, f0=500, f1=5200)
    add("blip", cue(9, "grab") - 0.45, 0.5, freq=1180, up=1.15)  # the "!"
    add("servo", cue(9, "grab") - 0.5, 0.5, dur=0.55, f0=90, f1=150)
    add("impact", cue(9, "grab") + 0.02, 0.3)
    add("click", cue(9, "grab"), 0.7)
    add("whoosh", cue(9, "grab") + 0.3, 0.4, dur=0.6, f0=900, f1=2400, shape="fall")
    add("impact", cue(9, "stamp"), 1.0, critical=True)
    add("thud", cue(9, "stamp"), 0.9, critical=True)
    add("boing", cue(9, "stamp") + 0.2, 0.55, critical=True)
    add("trombone", cue(9, "stamp") + 0.45, 0.6, critical=True)
    add("sparkle", cue(9, "end") + 0.1, 0.5)
    add("whoosh", cue(9, "end") - 0.05, 0.35, dur=0.7, f0=500, f1=2800)

    marks = {"starts": starts, "silence_start": cue(9, "grab") + 0.42, "stamp": cue(9, "stamp")}
    return ev, marks


def render_event(e: dict) -> np.ndarray:
    k = e["kind"]
    if k == "impact":
        return impact(1.0, seed=int(e["t"] * 10) % 97)
    if k == "whoosh":
        return noise_sweep(e["dur"], e["f0"], e["f1"], "band", seed=int(e["t"] * 100) % 1000, shape=e.get("shape", "swell"))
    if k == "click":
        return click(e.get("freq", 1900.0), seed=int(e["t"] * 100) % 1000, soft=e.get("soft", False))
    if k == "ping":
        return ping(e["freq"], 0.9, e.get("bright", 1.0))
    if k == "blip":
        return blip(e["freq"], 0.14, e.get("up", 1.5))
    if k == "chirp":
        return data_chirp(e["seed"])
    if k == "glitch":
        return glitch(e["seed"])
    if k == "buzz":
        return error_buzz()
    if k == "riser":
        n = noise_sweep(e["dur"], 400, 7500, "band", seed=77, shape="rise")
        tone = sine(np.linspace(180, 900, int(e["dur"] * SR)), int(e["dur"] * SR)) * np.linspace(0, 1, int(e["dur"] * SR)) ** 2 * 0.35
        return n * 0.8 + tone
    if k == "suck":
        return noise_sweep(e["dur"], 6000, 300, "band", seed=5, shape="rise") * 0.9
    if k == "sweep_tone":
        n = int(e["dur"] * SR)
        return sine(np.linspace(220, 1760, n), n) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2 * 0.3
    if k == "flip":
        swish = noise_sweep(0.12, 1800, 6000, "band", seed=int(e["t"] * 10) % 50, shape="burst") * 0.7
        tap = click(e["freq"], int(e["t"]), soft=True)
        out = np.zeros(max(len(swish), len(tap)))
        out[: len(swish)] += swish
        out[: len(tap)] += tap
        return out
    if k == "swell":
        n = int(e["dur"] * SR)
        return (sine(midi(60), n) + sine(midi(64), n) * 0.7 + sine(midi(67), n) * 0.6) * np.sin(np.pi * np.linspace(0, 1, n)) ** 2 * 0.22
    if k == "servo":
        return servo(e["dur"], e["f0"], e["f1"])
    if k == "tick":
        return tick_tock(False)
    if k == "tock":
        return tick_tock(True)
    if k == "thud":
        n = int(0.4 * SR)
        return sine(np.linspace(110, 48, n), n) * decay_env(n, 0.09)
    if k == "boing":
        return boing()
    if k == "trombone":
        return sad_trombone()
    if k == "sparkle":
        return sparkle()
    raise ValueError(k)


def compose_sfx(seconds: float, events: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    dry, wet = Bus(seconds), Bus(seconds)
    for e in events:
        sound = render_event(e)
        dry.add(sound, e["t"], e["gain"], e["pan"])
        if e["kind"] in ("impact", "ping", "sparkle", "trombone", "swell", "riser", "whoosh", "suck"):
            wet.add(sound, e["t"], e["gain"] * 0.35, e["pan"])
    return dry.buf, wet.buf


# ----------------------------------------------------------------------------------------------------------------------
# Mix
# ----------------------------------------------------------------------------------------------------------------------


def write_wav(path: Path, stereo: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (np.clip(stereo, -1, 1).T * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())


NARRATION_VOLUME = 0.85  # headroom trim for the original voice (it peaks at +0.1 dBFS on its own)


def protect_headroom(voice: np.ndarray, music: np.ndarray, sfx: np.ndarray, narration_volume: float, ceiling: float = 0.90) -> tuple[np.ndarray, np.ndarray]:
    """Where the voice is near its peak, momentarily lower the music/effects bed so voice + bed never exceeds `ceiling`.

    The voice is never touched. Gain changes use a 5 ms attack and 90 ms release so they are not audible as pumping.
    """
    window = int(0.03 * SR)
    voice_env = np.abs(voice) * narration_volume
    voice_env = np.maximum.reduce([np.roll(voice_env, k) for k in range(0, window, window // 6)]) if window else voice_env
    bed = np.abs(music) + np.abs(sfx)
    bed_env = np.maximum.reduce([np.roll(bed.max(axis=0), k) for k in range(0, window, window // 6)])
    headroom = np.clip(ceiling - voice_env, 0.0, None)
    gain = np.minimum(1.0, headroom / np.maximum(bed_env, 1e-9))
    # smooth: instant attack (take the minimum), slow release
    release = np.exp(-1 / (0.09 * SR))
    out = np.empty_like(gain)
    level = 1.0
    for i, target in enumerate(gain):
        level = target if target < level else target + (level - target) * release
        out[i] = level
    return music * out, sfx * out


def soft_limit(x: np.ndarray, ceiling: float = 0.89) -> np.ndarray:
    return ceiling * np.tanh(x / ceiling)


def measure(path: Path) -> dict:
    run = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    text = run.stderr
    def grab(label: str):
        for line in text.splitlines()[::-1]:
            if label in line:
                return float(line.split(label)[1].split()[0])
        return None
    return {"integratedLUFS": grab("I:"), "loudnessRangeLU": grab("LRA:"), "truePeakdBTP": grab("Peak:")}


def build(project: str) -> int:
    directory, storyboard, source, voice = load_project(project)
    duration = int(source["durationMs"]) / 1000
    total = duration + 1.2  # tails are cut back to `duration` with a fade
    events, marks = sfx_events(storyboard)
    n = int(duration * SR)

    pinned = directory / "sound" / "music-marks.json"
    music_marks = {**marks, **{k: v for k, v in json.loads(pinned.read_text()).items() if k != "note"}} if pinned.is_file() else marks
    music_dry, music_wet = compose_music(total, music_marks)
    ir = reverb_ir(2.4, 7)
    music = music_dry + 0.55 * convolve(music_wet, ir)
    # keep a pocket for the voice: gentle cut around 1.5-3.5 kHz on the music bus
    pocket = bandpass(music[0], 1500, 3500, 1), bandpass(music[1], 1500, 3500, 1)
    music = music - 0.3 * np.stack(pocket)
    sfx_dry, sfx_wet = compose_sfx(total, events)
    sfx = sfx_dry + convolve(sfx_wet, reverb_ir(1.6, 19))
    music, sfx = music[:, :n], sfx[:, :n]

    # --- ducking driven by the voice
    activity = voice_activity(voice, n)
    duck_music = 1 - (1 - 10 ** (-12 / 20)) * activity  # up to -12 dB under speech
    duck_sfx = 1 - (1 - 10 ** (-4 / 20)) * activity  # up to -4 dB, except 'critical' hits
    music = music * duck_music
    critical = np.zeros(n)
    for e in events:
        if e.get("critical"):
            a = int(e["t"] * SR)
            critical[a : a + int(2.4 * SR)] = 1.0
    sfx = sfx * (duck_sfx * (1 - critical) + critical)

    # --- the silence beat: music stops dead in the speaker's pause, then returns with the stamp
    cut = int(marks["silence_start"] * SR)
    back = int(marks["stamp"] * SR)
    fade = int(0.12 * SR)
    music[:, cut : cut + fade] *= np.linspace(1, 0, fade)
    music[:, cut + fade : back] = 0

    # --- soft start and end
    fin, fout = int(0.12 * SR), int(1.6 * SR)
    music[:, :fin] *= np.linspace(0, 1, fin)
    music[:, -fout:] *= np.linspace(1, 0, fout) ** 1.5
    sfx[:, -int(0.3 * SR) :] *= np.linspace(1, 0, int(0.3 * SR))

    music = soft_limit(music, 0.42)
    sfx = soft_limit(sfx, 0.62)
    music, sfx = protect_headroom(voice[:n], music, sfx, narration_volume=NARRATION_VOLUME)
    sound_dir = directory / "sound"
    write_wav(sound_dir / "music.wav", music)
    write_wav(sound_dir / "sfx.wav", sfx)
    return report(project, directory, voice, music, sfx, events, marks)


def report(project: str, directory: Path, voice: np.ndarray, music: np.ndarray, sfx: np.ndarray, events: list[dict], marks: dict) -> int:
    n = music.shape[1]
    voice = voice[:n] if len(voice) >= n else np.pad(voice, (0, n - len(voice)))
    v_stereo = np.stack([voice, voice])
    peak_sum1 = float(np.abs(NARRATION_VOLUME * v_stereo + music + sfx).max())
    narration_volume = NARRATION_VOLUME
    mixed = narration_volume * v_stereo + music + sfx
    preview = directory / "sound" / "mix-preview.wav"
    write_wav(preview, mixed)
    activity = voice_activity(voice, n)
    t_axis = np.arange(n) / SR
    speaking = activity > 0.9
    quiet = (activity < 0.1) & ((t_axis < marks['silence_start']) | (t_axis > marks['stamp'] + 0.3))
    rms = lambda x: 20 * np.log10(np.sqrt((x**2).mean()) + 1e-12)
    music_under_voice = rms(music[:, speaking]) if speaking.any() else None
    music_in_pauses = rms(music[:, quiet]) if quiet.any() else None
    voice_rms = rms(voice[speaking]) if speaking.any() else None
    result = {
        "project": project,
        "files": {name: hashlib.sha256((directory / "sound" / name).read_bytes()).hexdigest() for name in ("music.wav", "sfx.wav")},
        "durationSeconds": round(n / SR, 3),
        "sfxEvents": len(events),
        "narrationVolume": narration_volume,
        "samplePeakOfMix": round(float(np.abs(mixed).max()), 4),
        "samplesAboveCeiling": int((np.abs(mixed) > 0.98).sum()),
        "voiceRmsDb": None if voice_rms is None else round(voice_rms, 1),
        "musicRmsDbUnderVoice": None if music_under_voice is None else round(music_under_voice, 1),
        "musicRmsDbInPauses": None if music_in_pauses is None else round(music_in_pauses, 1),
        "voiceToMusicMarginDb": None if music_under_voice is None else round(voice_rms - music_under_voice, 1),
        "musicSilentFrom": round(marks["silence_start"], 2),
        "musicReturnsAt": round(marks["stamp"], 2),
        "mix": measure(preview),
        "voiceOnly": measure(directory / "narration.wav"),
    }
    (directory / "sound" / "mix-report.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("project")
    parser.add_argument("--check", action="store_true", help="re-measure the existing mix")
    args = parser.parse_args()
    if args.check:
        directory, storyboard, source, voice = load_project(args.project)
        events, marks = sfx_events(storyboard)
        def read(name):
            with wave.open(str(directory / "sound" / name), "rb") as handle:
                return np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).reshape(-1, 2).T.astype(np.float64) / 32768.0
        return report(args.project, directory, voice, read("music.wav"), read("sfx.wav"), events, marks)
    return build(args.project)


if __name__ == "__main__":
    sys.exit(main())
