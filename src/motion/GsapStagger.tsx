import {useRef} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {gsap} from 'gsap';
import {useGsapTimeline} from '../lib/gsap-timeline';

/**
 * Staggers its direct children with GSAP. The timeline is created paused and explicitly sought to
 * frame / fps on every frame, so preview scrubbing and renders are identical. Never free-runs.
 */
export const GsapStagger: React.FC<{
  children: React.ReactNode;
  startFrame?: number;
  stagger?: number;
  duration?: number;
  distance?: number;
  ease?: string;
  style?: React.CSSProperties;
}> = ({children, startFrame = 0, stagger = 0.08, duration = 0.6, distance = 40, ease = 'power3.out', style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const container = useRef<HTMLDivElement>(null);

  useGsapTimeline(
    () => {
      const timeline = gsap.timeline({paused: true});
      if (container.current) {
        timeline.from(container.current.children, {y: distance, opacity: 0, duration, ease, stagger}, startFrame / fps);
      }
      return timeline;
    },
    frame / fps,
    [startFrame, stagger, duration, distance, ease, fps],
  );

  return <div ref={container} style={style}>{children}</div>;
};
