import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {glowFilter} from './camera';
import {useProduction} from './context';
import {withAlpha} from './style';

/** Palette-driven animated background: soft radial light, a slowly drifting grid, and a vignette. */
export const AnimatedBackground: React.FC<{gridOpacity?: number}> = ({gridOpacity = 0.07}) => {
  const frame = useCurrentFrame();
  const {style: profile, fps} = useProduction();
  const {background, surface, primary} = profile.palette;
  const line = withAlpha(primary, gridOpacity);
  const drift = ((frame / fps) * 10.5) % 72; // px per second, so 30 and 60 fps look identical
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 70% 38%, ${surface} 0%, ${background} 68%)`}}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
          backgroundPosition: `${drift}px ${drift}px`,
          maskImage: 'radial-gradient(circle at 50% 50%, black 20%, transparent 78%)',
        }}
      />
      <AbsoluteFill style={{boxShadow: `inset 0 0 220px 80px ${withAlpha(background, 0.85)}`}} />
    </AbsoluteFill>
  );
};

/** Restrained glow. Strength follows the profile's lighting intensity and is capped. */
export const Glow: React.FC<{color?: string; intensity?: number; radius?: number; children: React.ReactNode}> = ({color, intensity, radius = 18, children}) => {
  const {style: profile} = useProduction();
  const strength = intensity ?? Math.min(1, (profile.lighting?.intensity ?? 0.6) * 0.6);
  return <div style={{filter: glowFilter(color ?? profile.palette.primary, strength, radius)}}>{children}</div>;
};
