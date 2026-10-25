from pathlib import Path

import bpy


root = Path(__file__).resolve().parents[1]
output = root / "out" / "blender-optix-test.png"
output.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(output)

# Build a small deterministic scene before switching to Cycles.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1.35, location=(0, 0, 0))
subject = bpy.context.object
material = bpy.data.materials.new("CyberMaterial")
material.diffuse_color = (0.01, 0.4, 0.52, 1.0)
material.metallic = 0.8
material.roughness = 0.2
subject.data.materials.append(material)

bpy.ops.object.light_add(type="AREA", location=(3.5, -3.0, 4.0))
bpy.context.object.data.energy = 900
bpy.context.object.data.color = (0.2, 0.9, 1.0)
bpy.context.object.data.shape = "DISK"
bpy.context.object.data.size = 4.0

bpy.ops.object.camera_add(location=(0, -6.2, 1.0), rotation=(1.40, 0.0, 0.0))
camera = bpy.context.object
scene.camera = camera

prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
gpu_devices = [device for device in prefs.devices if device.type == "OPTIX"]
if not gpu_devices:
    raise RuntimeError("No OptiX GPU found")
for device in prefs.devices:
    device.use = device.type == "OPTIX"

scene.render.engine = "CYCLES"
scene.cycles.device = "GPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = False
scene.world = bpy.data.worlds.new("CyberWorld")
scene.world.color = (0.002, 0.004, 0.009)

print(f"Rendering with OptiX device: {gpu_devices[0].name}")
bpy.ops.render.render(write_still=True)
if not output.is_file() or output.stat().st_size == 0:
    raise RuntimeError(f"Render output missing: {output}")
print(f"Verified Blender GPU render: {output} ({output.stat().st_size} bytes)")
