"""Render one Blender shot described by a BlenderShotManifest to a PNG sequence.

Run through the project's portable Blender (never directly):
    ./blender-studio.sh --background SCENE.blend --python scripts/blender_render_shot.py -- --manifest MANIFEST.json

Status: written against the manifest contract in src/production/blender-shot.ts. It has NOT been executed
in this milestone (no heavy renders were authorised); verify on a one-frame manifest before relying on it.
"""
import json
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if "--manifest" not in argv:
    raise SystemExit("usage: ... -- --manifest MANIFEST.json")
manifest = json.loads(Path(argv[argv.index("--manifest") + 1]).read_text())

root = Path(__file__).resolve().parents[1]
directory = (root / manifest["output"]["directory"]).resolve()
if root not in directory.parents:
    raise SystemExit("output directory must stay inside the project")
directory.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.render.resolution_x = manifest["width"]
scene.render.resolution_y = manifest["height"]
scene.render.resolution_percentage = 100
scene.render.fps = int(manifest["fps"])
scene.frame_start = manifest["startFrame"]
scene.frame_end = manifest["startFrame"] + manifest["frameCount"] - 1

view = {"standard": "Standard", "agx": "AgX", "filmic": "Filmic"}[manifest["colorSpace"]["view"]]
scene.view_settings.view_transform = view
scene.sequencer_colorspace_settings.name = "sRGB"

scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.color_depth = "8"
# frame_%05d.png in the manifest corresponds to Blender's frame_##### placeholder.
prefix = manifest["output"]["filePattern"].split("%")[0]
scene.render.filepath = str(directory / (prefix + "#####"))

scene.render.engine = "CYCLES"
scene.cycles.samples = manifest["samples"]
if manifest["device"] != "CPU":
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = manifest["device"]
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type != "CPU"
    scene.cycles.device = "GPU"
else:
    scene.cycles.device = "CPU"

bpy.ops.render.render(animation=True)
print(f"Rendered {manifest['frameCount']} frame(s) to {directory}")
