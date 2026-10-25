import {DependencyList, useLayoutEffect} from 'react';
import {gsap} from 'gsap';

/**
 * Creates a paused GSAP timeline and seeks it from Remotion's frame clock.
 * This keeps preview scrubbing and offline renders deterministic.
 */
export const useGsapTimeline = (
  factory: () => gsap.core.Timeline,
  timeInSeconds: number,
  dependencies: DependencyList,
) => {
  useLayoutEffect(() => {
    const timeline = factory().pause(0);
    timeline.seek(timeInSeconds, false);
    return () => {
      timeline.kill();
    };
    // The caller owns the stable dependency list for its referenced elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeInSeconds, ...dependencies]);
};
