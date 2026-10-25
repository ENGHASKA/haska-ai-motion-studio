import {interpolate, useCurrentFrame} from 'remotion';
import {clamp, settle} from '../lib/motion';

type HudRingProps = {
  x: number;
  y: number;
  size: number;
  delay: number;
  direction?: 1 | -1;
};

export const HudRing: React.FC<HudRingProps> = ({
  x,
  y,
  size,
  delay,
  direction = 1,
}) => {
  const frame = useCurrentFrame();
  const reveal = settle(frame, 30, delay);
  const sweep = interpolate(frame, [delay, 150], [0, 330 * direction], clamp);

  return (
    <div
      className="hud-ring"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        opacity: reveal * 0.85,
        transform: `scale(${0.65 + reveal * 0.35}) rotate(${sweep}deg)`,
      }}
    >
      <div className="hud-ring__inner" />
      <div className="hud-ring__tick" />
    </div>
  );
};
