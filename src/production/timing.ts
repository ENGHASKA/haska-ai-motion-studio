// The single frame model shared by narration, shots, captions, and animation.
// Every ms -> frame conversion in the project goes through here.

export const msToFrame = (ms: number, fps: number) => Math.round((ms * fps) / 1000);
export const frameToMs = (frame: number, fps: number) => Math.round((frame * 1000) / fps);

/** Half-open frame range [from, to) for a millisecond span; always at least one frame long. */
export const msRangeToFrames = (startMs: number, endMs: number, fps: number) => {
  const from = msToFrame(startMs, fps);
  return {from, to: Math.max(from + 1, msToFrame(endMs, fps))};
};

export const durationFramesFor = (durationMs: number, fps: number) => Math.max(1, Math.ceil((durationMs / 1000) * fps));
