import {createContext, useContext} from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {cameraTransform, parallaxTransform} from './camera';
import type {Camera} from './camera';
import {useProduction} from './context';
import {easingOf} from './style';

const CameraContext = createContext<Camera | null>(null);

export type CameraKey = Camera & {
  /** Local frame of this key. */
  frame: number;
  /** Name of a motion.easings curve, applied to the segment that ends at this key. */
  easing?: string;
};

const sampleCamera = (keys: readonly CameraKey[], frame: number, ease: (name: string | undefined, t: number) => number): Camera => {
  if (frame <= keys[0].frame) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (frame <= keys[i].frame) {
      const a = keys[i - 1];
      const b = keys[i];
      const t = ease(b.easing, (frame - a.frame) / Math.max(1, b.frame - a.frame));
      const mix = (from: number, to: number) => from + (to - from) * t;
      return {x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale), rotate: mix(a.rotate ?? 0, b.rotate ?? 0)};
    }
  }
  return keys[keys.length - 1];
};

/**
 * Camera-style motion. Children are laid out in canvas coordinates; the camera pans, zooms and rolls them.
 * Keys are in local frames and use the Style Profile's easings.
 */
export const CameraRig: React.FC<{keys: readonly CameraKey[]; children: React.ReactNode}> = ({keys, children}) => {
  const frame = useCurrentFrame();
  const {style, width, height} = useProduction();
  const camera = sampleCamera(keys, frame, (name, t) => easingOf(style, name ?? 'standard')(t));
  return (
    <CameraContext.Provider value={camera}>
      <AbsoluteFill>
        <div style={{position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform: cameraTransform(camera, {width, height})}}>
          {children}
        </div>
      </AbsoluteFill>
    </CameraContext.Provider>
  );
};

/** A layer at `depth` (1 = fixed to the world, <1 = further away) inside a CameraRig. */
export const ParallaxLayer: React.FC<{depth: number; children: React.ReactNode}> = ({depth, children}) => {
  const camera = useContext(CameraContext);
  const {width, height} = useProduction();
  return (
    <div style={{position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform: camera ? parallaxTransform(camera, depth, {width, height}) : undefined}}>
      {children}
    </div>
  );
};
