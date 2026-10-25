import {useCurrentFrame} from 'remotion';
import {useProduction} from './context';
import {durationFrames, easingOf} from './style';
import type {DurationName} from './style';

type RevealProps = {
  /** Local frame (within the current Sequence) at which the entrance begins. */
  start?: number;
  duration?: DurationName | number;
  exitAt?: number;
  exitDuration?: DurationName | number;
  /** "start" / "end" follow the reading direction (set `rtl` for Arabic). */
  direction?: 'up' | 'down' | 'start' | 'end' | 'none';
  rtl?: boolean;
  distance?: number;
  scaleFrom?: number;
  /** Reveal by a clip wipe instead of a fade. */
  clip?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Entrance/exit wrapper. Timing and curves come from the Style Profile's motion grammar. */
export const Reveal: React.FC<RevealProps> = ({
  start = 0,
  duration = 'standard',
  exitAt,
  exitDuration = 'quick',
  direction = 'up',
  rtl = false,
  distance = 48,
  scaleFrom = 1,
  clip = false,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const {style: profile, fps} = useProduction();
  const frames = (value: DurationName | number) => (typeof value === 'number' ? value : durationFrames(profile, value, fps));

  const entered = easingOf(profile, 'enter')(clamp01((frame - start) / frames(duration)));
  const exited = exitAt === undefined ? 0 : easingOf(profile, 'exit')(clamp01((frame - exitAt) / frames(exitDuration)));
  const visible = entered * (1 - exited);
  const away = 1 - entered + exited;

  const horizontal = direction === 'start' ? (rtl ? 1 : -1) : direction === 'end' ? (rtl ? -1 : 1) : 0;
  const vertical = direction === 'up' ? 1 : direction === 'down' ? -1 : 0;
  const scale = scaleFrom + (1 - scaleFrom) * (1 - away);

  return (
    <div
      style={{
        opacity: clip ? 1 : visible,
        transform: `translate(${horizontal * distance * away}px, ${vertical * distance * away}px) scale(${scale})`,
        clipPath: clip ? `inset(0 ${(1 - visible) * 100}% 0 0)` : undefined,
        willChange: 'transform, opacity',
        ...style,
      }}
    >
      {children}
    </div>
  );
};
