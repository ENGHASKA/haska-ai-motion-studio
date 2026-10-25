import bpy


def list_devices(backend: str) -> list[str]:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
    except Exception as exc:  # Blender backends vary by driver and build.
        return [f"{backend}: unavailable ({exc})"]

    found = []
    for device in prefs.devices:
        if device.type in {backend, "CPU"}:
            found.append(f"{backend}: {device.name} [{device.type}] use={device.use}")
    return found or [f"{backend}: no devices"]


print(f"Blender: {bpy.app.version_string}")
for backend_name in ("OPTIX", "CUDA"):
    for line in list_devices(backend_name):
        print(line)
