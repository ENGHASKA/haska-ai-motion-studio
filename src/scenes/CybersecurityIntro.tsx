import {AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig} from 'remotion';
import {DataStream} from '../components/DataStream';
import {Grid} from '../components/Grid';
import {HudRing} from '../components/HudRing';
import {clamp, fade, fadeOut, settle} from '../lib/motion';

const HexShield: React.FC<{progress: number}> = ({progress}) => {
  const dash = 820;
  return (
    <svg className="shield" viewBox="0 0 300 340" aria-hidden="true">
      <path
        d="M150 14 L274 58 V151 C274 235 222 298 150 326 C78 298 26 235 26 151 V58 Z"
        fill="rgba(4, 22, 37, 0.66)"
        stroke="#53f6ff"
        strokeWidth="4"
        strokeDasharray={dash}
        strokeDashoffset={dash * (1 - progress)}
      />
      <path
        d="M150 72 L211 105 V164 C211 207 187 242 150 262 C113 242 89 207 89 164 V105 Z"
        fill="rgba(0, 255, 199, 0.08)"
        stroke="#00ffc7"
        strokeWidth="3"
        opacity={progress}
      />
      <path d="M120 164 L143 187 L188 136" fill="none" stroke="#e9ffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} />
    </svg>
  );
};

export const CybersecurityIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = settle(frame, fps, 8);
  const shieldProgress = interpolate(frame, [15, 72], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const scanX = interpolate(frame, [0, 149], [-240, 2160], clamp);
  const outro = fadeOut(frame, 133, 149);
  const statusOpacity = fade(frame, 72, 93) * outro;

  return (
    <AbsoluteFill className="cyber-root" style={{opacity: outro}}>
      <Grid />
      <div className="vignette" />
      <div className="scanline" style={{transform: `translateX(${scanX}px) skewX(-10deg)`}} />
      <div className="noise" style={{transform: `translate(${frame % 4}px, ${frame % 3}px)`}} />

      {[145, 408, 731, 1268, 1602, 1810].map((x, index) => (
        <DataStream key={x} x={x} delay={index * 7} />
      ))}

      <HudRing x={118} y={164} size={230} delay={5} />
      <HudRing x={1530} y={650} size={280} delay={18} direction={-1} />
      <HudRing x={1570} y={110} size={140} delay={30} />

      <div className="top-rule" style={{transform: `scaleX(${entrance})`}}>
        <span>NEURAL DEFENSE NETWORK</span>
        <span>NODE 07 / ACTIVE</span>
      </div>

      <div className="hero-lockup" style={{transform: `translateY(${(1 - entrance) * 80}px)`}}>
        <div className="eyebrow" style={{opacity: fade(frame, 4, 22)}}>SECURE SYSTEMS // 2026</div>
        <h1 style={{clipPath: `inset(0 ${(1 - entrance) * 100}% 0 0)`}}>
          CYBER<span>SHIELD</span>
        </h1>
        <div className="title-echo" style={{opacity: 0.14 * entrance, transform: `translate(${(1 - entrance) * -60}px, 20px)`}}>
          CYBERSHIELD
        </div>
        <p style={{opacity: fade(frame, 34, 56)}}>
          Autonomous threat detection for the next attack surface.
        </p>
      </div>

      <div className="shield-stage" style={{transform: `scale(${0.8 + entrance * 0.2}) rotateY(${(1 - entrance) * -25}deg)`}}>
        <div className="shield-glow" style={{opacity: shieldProgress}} />
        <HexShield progress={shieldProgress} />
        <div className="orbit orbit-a" style={{transform: `rotate(${frame * 1.25}deg)`}} />
        <div className="orbit orbit-b" style={{transform: `rotate(${-frame * 0.8}deg)`}} />
      </div>

      <Sequence from={62} layout="none">
        <div className="metrics" style={{opacity: statusOpacity}}>
          <div><strong>99.98%</strong><span>THREAT COVERAGE</span></div>
          <div><strong>4.2ms</strong><span>RESPONSE LATENCY</span></div>
          <div><strong>ZERO</strong><span>TRUST ASSUMED</span></div>
        </div>
        <div className="status-pill" style={{opacity: statusOpacity}}>
          <i /> SYSTEM HARDENED
        </div>
      </Sequence>

      <div className="corner corner-tl" />
      <div className="corner corner-br" />
      <div className="frame-counter">F {String(frame).padStart(3, '0')} / 149</div>
    </AbsoluteFill>
  );
};
