import {Easing, interpolate, spring} from 'remotion';

export const clamp = {
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
};

export const fade = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

export const fadeOut = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [1, 0], {
    ...clamp,
    easing: Easing.in(Easing.cubic),
  });

export const settle = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: {damping: 16, stiffness: 120, mass: 0.8},
    durationInFrames: 32,
  });

export const easeOutExpo = (value: number) =>
  value === 1 ? 1 : 1 - 2 ** (-10 * value);

// [frame, value, easing applied to the segment that ends at this stop]
export type Stop = readonly [frame: number, value: number, easing?: (t: number) => number];

/**
 * Piecewise-eased keyframe track. Each segment gets its own easing, so a
 * camera can hold, push, and release with different curves in one track.
 */
export const track = (frame: number, stops: readonly Stop[]) => {
  const [firstFrame, firstValue] = stops[0];
  if (frame <= firstFrame) return firstValue;

  for (let index = 1; index < stops.length; index++) {
    const [endFrame, endValue, easing = Easing.linear] = stops[index];
    if (frame <= endFrame) {
      const [startFrame, startValue] = stops[index - 1];
      const progress = (frame - startFrame) / (endFrame - startFrame);
      return startValue + (endValue - startValue) * easing(progress);
    }
  }

  return stops[stops.length - 1][1];
};

export const easeOutSoft = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInSoft = Easing.bezier(0.7, 0, 0.84, 0);
export const easeInOutSoft = Easing.bezier(0.65, 0, 0.35, 1);
