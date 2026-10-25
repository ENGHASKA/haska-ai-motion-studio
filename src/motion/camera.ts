// Camera and parallax math. A camera looks at world point (x, y) at `scale` zoom; canvas center is the pivot.
export type Camera = {x: number; y: number; scale: number; rotate?: number};
export type Canvas = {width: number; height: number};

/** CSS transform (transform-origin: 0 0) that maps world coordinates to the screen for a camera. */
export const cameraTransform = (camera: Camera, canvas: Canvas) =>
  `translate(${canvas.width / 2}px, ${canvas.height / 2}px) rotate(${camera.rotate ?? 0}deg) scale(${camera.scale}) translate(${-camera.x}px, ${-camera.y}px)`;

/**
 * Correction applied inside the camera rig so a layer behaves as if it sat at `depth` (1 = fixed to the world,
 * 0 = infinitely far / pinned to the screen). Derived from T = R^-1 ∘ O for rig R and layer matrix O.
 * Returns a transform (origin 0 0): translate(tx, ty) scale(k).
 */
export const parallaxCorrection = (camera: Camera, depth: number, canvas: Canvas) => {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const layerScale = 1 + (camera.scale - 1) * depth;
  const layerX = cx + (camera.x - cx) * depth;
  const layerY = cy + (camera.y - cy) * depth;
  const k = layerScale / camera.scale;
  return {k, tx: camera.x - k * layerX, ty: camera.y - k * layerY};
};

export const parallaxTransform = (camera: Camera, depth: number, canvas: Canvas) => {
  const {k, tx, ty} = parallaxCorrection(camera, depth, canvas);
  return `translate(${tx}px, ${ty}px) scale(${k})`;
};

/** Controlled glow: intensity is clamped so effects stay restrained. */
export const glowFilter = (color: string, intensity: number, radius = 18) => {
  const i = Math.min(1, Math.max(0, intensity));
  const r = Math.min(40, Math.max(0, radius));
  if (i === 0 || r === 0) return 'none';
  const alpha = Math.round(i * 0.6 * 255).toString(16).padStart(2, '0');
  const hex = color.slice(0, 7);
  return `drop-shadow(0 0 ${r * 0.4}px ${hex}${alpha}) drop-shadow(0 0 ${r}px ${hex}${Math.round(i * 0.3 * 255).toString(16).padStart(2, '0')})`;
};
