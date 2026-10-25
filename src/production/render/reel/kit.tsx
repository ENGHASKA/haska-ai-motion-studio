// Shared helpers for the Reel scenes. Everything is a pure function of the frame and the video's fps,
// expressed in seconds so the scenes look identical at 30 and 60 fps.
import {useVideoConfig, useCurrentFrame, AbsoluteFill} from 'remotion';
import {AnimatedBackground, KineticText, useProduction} from '../../../motion';
import type {KineticTextProps} from '../../../motion';
import {easingOf, familyFor, withAlpha} from '../../../motion/style';
import type {Shot} from '../../shot-graph';
import {reelBlock} from '../../layout';

export const W = 1080;
export const H = 1920;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const useReel = (shot: Shot) => {
  const frame = useCurrentFrame();
  const env = useProduction();
  const {durationInFrames} = useVideoConfig();
  const t = frame / env.fps;
  const cues = (shot.engineOptions?.cues ?? {}) as Record<string, number>;
  const colors = env.style.palette;
  return {
    ...env,
    frame,
    t,
    seconds: durationInFrames / env.fps,
    colors,
    /** Font stacks from the Style Profile, for SVG text (CSS text uses the same through KineticText). */
    fonts: {display: familyFor(env.style, 'display', 'latin'), arabic: familyFor(env.style, 'display', 'arabic')},
    /** Cue time in seconds from the scene start (storyboard `options.cues` overrides the default). */
    cue: (name: string, fallback: number) => (typeof cues[name] === 'number' ? cues[name] : fallback),
    /** Eased 0..1 progress of an interval, using the Style Profile's named curve. */
    prog: (from: number, duration: number, curve: 'enter' | 'standard' | 'exit' = 'enter') => easingOf(env.style, curve)(clamp01((t - from) / Math.max(1e-6, duration))),
    /** Linear 0..1 progress. */
    lin: (from: number, duration: number) => clamp01((t - from) / Math.max(1e-6, duration)),
    option: <T,>(key: string, fallback: T): T => (shot.engineOptions?.[key] as T | undefined) ?? fallback,
    sec: (seconds: number) => Math.round(seconds * env.fps),
  };
};

export type Reel = ReturnType<typeof useReel>;

/** A text block from the shared spec table (same box QA measures), animated with KineticText. */
export const SpecText: React.FC<{
  shot: Shot;
  name: string;
  reel: Reel;
  at: number;
  exitAt?: number;
  mode?: KineticTextProps['mode'];
  align?: KineticTextProps['align'];
  color?: string;
  stagger?: number;
  style?: React.CSSProperties;
}> = ({shot, name, reel, at, exitAt, mode = 'word', align = 'center', color, stagger = 0.07, style}) => {
  const block = reelBlock(shot, name);
  if (!block) return null;
  return (
    <div style={{position: 'absolute', left: block.rect.left, top: block.rect.top, width: block.rect.width, height: block.rect.height, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>
      <KineticText
        text={block.text}
        role={block.role}
        mode={mode}
        start={reel.sec(at)}
        exitAt={exitAt === undefined ? undefined : reel.sec(exitAt)}
        staggerFrames={Math.max(1, reel.sec(stagger))}
        fontSize={block.fontSize}
        minFontSize={block.minFontSize}
        maxLines={block.maxLines}
        maxWidth={block.rect.width}
        maxHeight={block.rect.height}
        align={align}
        color={color}
      />
    </div>
  );
};

/** Floating motes in two depth layers (far = small and slow, near = larger, softer and faster). Seeded, time-based. */
const Motes: React.FC<{reel: Reel}> = ({reel}) => {
  const {t, colors: c} = reel;
  const fade = reel.prog(0, 1.2);
  const mote = (seed: number, near: boolean) => {
    const speed = near ? 34 + rand(seed + 2) * 30 : 8 + rand(seed + 2) * 12;
    const x = rand(seed) * W + Math.sin(t * (0.3 + rand(seed + 5)) + seed) * (near ? 26 : 10);
    const y = (((rand(seed + 1) * H - t * speed) % H) + H) % H;
    const tint = rand(seed + 3) > 0.72 ? c.accent : c.primary;
    return {x, y, r: near ? 3 + rand(seed + 4) * 5 : 1.2 + rand(seed + 4) * 1.8, a: near ? 0.16 + rand(seed + 6) * 0.14 : 0.18 + rand(seed + 6) * 0.3, tint};
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: fade}}>
      {Array.from({length: 34}, (_, i) => mote(i * 7 + 11, false)).map((m, i) => <circle key={`f${i}`} cx={m.x} cy={m.y} r={m.r} fill={m.tint} opacity={m.a} />)}
      <g style={{filter: 'blur(2.5px)'}}>
        {Array.from({length: 9}, (_, i) => mote(i * 13 + 400, true)).map((m, i) => <circle key={`n${i}`} cx={m.x} cy={m.y} r={m.r} fill={m.tint} opacity={m.a} />)}
      </g>
    </svg>
  );
};

/** Dark navy stage: drifting grid, slow orange/cyan light, depth motes, and a soft vignette. */
export const Stage: React.FC<{reel: Reel; children: React.ReactNode; light?: boolean}> = ({reel, children, light = true}) => {
  const {colors: c, t} = reel;
  if (reel.width !== W || reel.height !== H) {
    return (
      <AbsoluteFill style={{background: '#1a0508', color: '#ff9aa5', padding: 60, fontFamily: 'DejaVu Sans Mono, monospace', fontSize: 28, justifyContent: 'center'}}>
        Reel scenes are designed for a {W}×{H} (9:16) canvas, but this composition is {reel.width}×{reel.height}. Render with the "reel" preset.
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AnimatedBackground gridOpacity={0.045} />
      {light ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(circle at ${50 + Math.sin(t * 0.45) * 16}% ${42 + Math.cos(t * 0.35) * 7}%, ${withAlpha(c.accent, 0.12)} 0%, transparent 40%), radial-gradient(circle at ${28 + Math.cos(t * 0.3) * 10}% 74%, ${withAlpha(c.primary, 0.1)} 0%, transparent 44%)`,
          }}
        />
      ) : null}
      <Motes reel={reel} />
      {children}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 46%, transparent 52%, ${withAlpha(c.background, 0.55)} 100%)`, pointerEvents: 'none'}} />
    </AbsoluteFill>
  );
};

export const FullSvg: React.FC<{children: React.ReactNode; glowId: string; opacity?: number; style?: React.CSSProperties; push?: number}> = ({children, glowId, opacity = 1, style, push = 0.04}) => {
  const {transform: extraTransform, ...restStyle} = style ?? {};
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const p = Math.min(1, frame / Math.max(1, durationInFrames));
  // Slow push toward the centre of the art, with a drifting pan: depth without moving any text.
  const camera = `translate(${Math.sin(p * Math.PI) * -10}px, ${p * -14}px) scale(${1 + push * p})`;
  return (
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: 0, width: '100%', height: '100%', opacity, transformOrigin: '540px 800px', transform: `${extraTransform ?? ''} ${camera}`, ...restStyle}}>
    <defs>
      <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    {children}
  </svg>
  );
};

/** Deterministic pseudo-random in [0,1) for a seed (no Math.random: renders must be identical). */
export const rand = (seed: number) => {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Overshooting ease-out for pops (restrained: ~8%). */
export const pop = (p: number) => {
  const c1 = 1.1;
  const c3 = c1 + 1;
  return 1 + c3 * (p - 1) ** 3 + c1 * (p - 1) ** 2;
};

/** Small caption chip: a rounded outlined label. */
export const Chip: React.FC<{x: number; y: number; w: number; h?: number; label: string; color: string; fill?: string; size?: number; opacity?: number; scale?: number; reel: Reel; glow?: boolean}> = ({x, y, w, h = 84, label, color, fill, size = 42, opacity = 1, scale = 1, reel, glow}) => {
  const {style} = reel;
  const latin = /^[\x00-\x7F]+$/.test(label);
  return (
    <div
      dir={latin ? 'ltr' : 'rtl'}
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${color}`, borderRadius: h / 2, background: fill ?? withAlpha(style.palette.background, 0.65), color,
        fontFamily: latin ? style.typography.display.family : `${style.typography.arabic?.family ?? 'DejaVu Sans'}, sans-serif`, fontWeight: 700, fontSize: size,
        opacity, transform: `scale(${scale})`, boxShadow: glow ? `0 0 30px ${withAlpha(color, 0.45)}` : undefined, whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );
};
