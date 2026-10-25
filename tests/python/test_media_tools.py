"""Unit tests for the offline media tools. Run: python3 -m unittest discover -s tests/python -v (from the project root)."""
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import cutplan  # noqa: E402
import media_tools  # noqa: E402
import package_lib  # noqa: E402
import verify_package  # noqa: E402
from platform_util import FFMPEG, exe_name  # noqa: E402

WORDS = [{"text": f"w{i}", "startMs": i * 1000, "endMs": i * 1000 + 900} for i in range(10)]


class CutPlan(unittest.TestCase):
    def test_silence_to_keep_leaves_padding(self):
        keep = cutplan.keep_from_silence(10.0, [(2.0, 4.0)], pad=0.1)
        self.assertEqual(keep, [(0.0, 2.1), (3.9, 10.0)])

    def test_drop_keep_undo_roundtrip(self):
        plan = cutplan.new_plan("x.mp4", 10.0, [(0, 10.0)])
        base = cutplan.spans(plan)
        cutplan.apply_op(plan, WORDS, {"op": "drop", "from": 2, "to": 3})
        self.assertEqual(cutplan.edited_duration(plan), 8.1)
        cutplan.apply_op(plan, WORDS, {"op": "keep", "from": 0, "to": 5})
        self.assertEqual(plan["keep"], [{"start": 0, "end": 2.0}, {"start": 3.9, "end": 5.9}])
        cutplan.undo(plan, base, WORDS)
        self.assertEqual(cutplan.edited_duration(plan), 8.1)
        cutplan.undo(plan, base, WORDS)
        self.assertEqual(cutplan.edited_duration(plan), 10.0)

    def test_caption_remap_drops_cut_words_and_keeps_order(self):
        plan = cutplan.new_plan("x.mp4", 10.0, [(0, 10.0)])
        cutplan.apply_op(plan, WORDS, {"op": "drop", "from": 2, "to": 3})
        out = cutplan.remap_words(plan, WORDS)
        self.assertEqual([w["text"] for w in out], ["w0", "w1", "w4", "w5", "w6", "w7", "w8", "w9"])
        self.assertEqual(out[2]["startMs"], 2100)
        self.assertTrue(all(a["endMs"] <= b["startMs"] + 1 for a, b in zip(out, out[1:])))

    def test_bad_range_and_missing_phrase(self):
        plan = cutplan.new_plan("x.mp4", 10.0, [(0, 10.0)])
        with self.assertRaises(ValueError):
            cutplan.apply_op(plan, WORDS, {"op": "drop", "from": 5, "to": 99})
        self.assertIsNone(cutplan.find_phrase(WORDS, "nope"))
        self.assertEqual(cutplan.find_phrase(WORDS, "w3, w4"), (3, 4))


class Rhythm(unittest.TestCase):
    def test_click_track_tempo(self):
        import numpy as np

        rate = 22050
        y = np.zeros(rate * 8, dtype=np.float32)
        for t in np.arange(0, 8, 0.5):
            i, n = int(t * rate), np.arange(800)
            y[i : i + 800] += np.sin(2 * np.pi * 1000 * n / rate) * np.exp(-n / 120)
        grid = media_tools.beat_grid(y)
        self.assertAlmostEqual(grid["bpm"], 120, delta=3)
        gaps = np.diff(grid["beats"])
        self.assertAlmostEqual(float(gaps.mean()), 0.5, delta=0.02)

    def test_silence_returns_empty_grid(self):
        import numpy as np

        self.assertEqual(media_tools.beat_grid(np.zeros(100, dtype=np.float32))["beats"], [])


class Interchange(unittest.TestCase):
    def test_edl_and_otio_cover_each_kept_span(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            plan = cutplan.new_plan("clip one.mp4", 10.0, [(0, 2.0), (4.0, 5.5)])
            (tmp / "plan.json").write_text(json.dumps(plan))
            for fn, name in (("edl", "o.edl"), ("otio", "o.otio")):
                subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "media_tools.py"), fn, str(tmp / "plan.json"), str(tmp / name), "--fps", "30"], check=True, capture_output=True)
            edl = (tmp / "o.edl").read_text().splitlines()
            self.assertIn("001  CLIPONE  V     C        00:00:00:00 00:00:02:00 00:00:00:00 00:00:02:00", edl)
            self.assertIn("002  CLIPONE  V     C        00:00:04:00 00:00:05:15 00:00:02:00 00:00:03:15", edl)
            otio = json.loads((tmp / "o.otio").read_text())
            clips = otio["tracks"]["children"][0]["children"]
            self.assertEqual([c["source_range"]["duration"]["value"] for c in clips], [60, 45])

    def test_palette_profile_is_readable_and_deterministic(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as tmp:
            image = Image.new("RGB", (64, 64), (24, 42, 75))
            image.paste((255, 122, 26), (0, 0, 64, 20))
            path = Path(tmp) / "ref.png"
            image.save(path)
            first = media_tools.palette_profile(media_tools.dominant_colors(str(path)), "ref-x", "X")
            second = media_tools.palette_profile(media_tools.dominant_colors(str(path)), "ref-x", "X")
            self.assertEqual(first, second)
            p = first["palette"]
            self.assertNotEqual(p["accent"], p["background"])
            self.assertTrue(all(len(v) == 7 and v.startswith("#") for v in p.values()))


class Platform(unittest.TestCase):
    def test_exe_name_is_idempotent_and_os_aware(self):
        self.assertIn(exe_name("ffmpeg"), ("ffmpeg", "ffmpeg.exe"))
        self.assertEqual(exe_name(exe_name("ffmpeg")), exe_name("ffmpeg"))

    def test_ffmpeg_resolves(self):
        self.assertTrue(FFMPEG)


class Packaging(unittest.TestCase):
    def test_allow_and_deny_rules(self):
        self.assertTrue(package_lib.allowed("src/majed/montage.ts", False))
        self.assertFalse(package_lib.allowed("public/audio-projects/private-project/storyboard.json", False))
        self.assertFalse(package_lib.allowed("public/audio-projects/private-project/storyboard.json", True))
        self.assertFalse(package_lib.allowed("out/reel.mp4", True))
        for secret in ("a/.env", "a/key.pem", "x/auth.json", "a/model.bin", "a/Track.m4a", "a/narration.wav", "tools/whisper-cli", "a/my_token.txt", "haska.config.json"):
            self.assertIsNotNone(package_lib.denied(secret), secret)
        self.assertIsNone(package_lib.denied("fixtures/cybersecurity-voice.wav"))
        self.assertIsNone(package_lib.denied("src/root.tsx"))

    def test_secret_and_home_path_scanners(self):
        self.assertTrue(package_lib.scan_text("a.ts", b"const k = 'sk-" + b"A" * 30 + b"'"))
        self.assertTrue(package_lib.scan_text("a.json", b'{"api_' + b'key": "abcdefghijklmnop1234"}'))
        self.assertTrue(package_lib.scan_text("a.pem", b"-----BEGIN RSA " + b"PRIVATE KEY-----"))
        self.assertFalse(package_lib.scan_text("a.ts", b"const x = 1; // token budget"))
        fake_home = b"/home/" + b"someone/project"
        self.assertTrue(package_lib.home_path_findings("src/a.ts", b"const p = '" + fake_home + b"'"))
        self.assertFalse(package_lib.home_path_findings("docs/a.md", fake_home))

    def test_verifier_catches_tampering_and_private_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)

            def build(files: dict, name="p"):
                manifest = {"files": [{"path": k, "sha256": package_lib.sha256(v), "bytes": len(v)} for k, v in files.items()], "includesPersonalProjects": False}
                required = {r: b"x" for r in ("package.json", "THIRD_PARTY_NOTICES.md", "third_party/majed-video/LICENSE", "scripts/setup-linux.sh", "scripts/setup-windows.ps1", "docs/INSTALL-ar.md")}
                for k, v in required.items():
                    files.setdefault(k, v)
                    manifest["files"].append({"path": k, "sha256": package_lib.sha256(files[k]), "bytes": len(files[k])})
                zpath = tmp / f"{name}.zip"
                with zipfile.ZipFile(zpath, "w") as z:
                    for k, v in files.items():
                        z.writestr(f"{name}/{k}", v)
                    z.writestr(f"{name}/PACKAGE-MANIFEST.json", json.dumps(manifest))
                (tmp / f"{zpath.name}.sha256").write_text(f"{package_lib.sha256(zpath.read_bytes())}  {zpath.name}\n")
                return zpath

            good = build({"src/a.ts": b"export const a = 1;"}, "good")
            self.assertEqual(verify_package.verify(good, None), [])
            bad = build({"src/a.ts": b"x", ".env": b"A=1", "src/k.ts": b"k='sk-" + b"B" * 30 + b"'"}, "bad")
            problems = " | ".join(verify_package.verify(bad, None))
            self.assertIn("forbidden file: .env", problems)
            self.assertIn("possible credential", problems)
            good.write_bytes(good.read_bytes() + b"tamper")
            self.assertIn("zip checksum does not match", " ".join(verify_package.verify(good, None)))


if __name__ == "__main__":
    unittest.main()
